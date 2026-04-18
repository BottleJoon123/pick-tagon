import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

// ESPN Public API — 인증 불필요, JSON 응답
const ESPN_API  = 'https://site.api.espn.com/apis/site/v2/sports/mma/ufc'
const ESPN_WEB  = 'https://site.web.api.espn.com/apis/common/v3/sports/mma/ufc'
const FETCH_TIMEOUT_MS = 12000
const BATCH_SIZE       = 15
const SHRINKAGE_K      = 8
const FINISH_POWER     = 1.35

const FIXED_MAX = {
  slpm: 10, strAcc: 80, sapm: 8, strDef: 80,
  tdAvg: 6, tdAcc: 80, tdDef: 95, subAvg: 3, finishMix: 90,
}

interface SyncRequest {
  slug?: string; syncAll?: boolean; division?: string
  offset?: number; batchSize?: number
  // 클라이언트사이드 모드: 브라우저가 파싱해서 직접 보내는 경우
  clientStats?: ClientStatPayload[]
}

interface ClientStatPayload {
  fighterId: string
  espnId?: string
  heightCm?: number; weightKg?: number; reachCm?: number
  slpm?: number; sapm?: number; strAcc?: number; strDef?: number
  tdAvg?: number; tdAcc?: number; tdDef?: number; subAvg?: number
  koRate?: number; subRate?: number; decRate?: number
}

interface FighterRow {
  id: string; name_en: string | null; division: string | null
  wins: number | null; height?: string | null; reach?: string | null
  espn_id?: string | null
}

interface FighterBaseline {
  division: string
  slpm_p05: number | null; slpm_p95: number | null
  str_acc_p05: number | null; str_acc_p95: number | null
  sapm_p05: number | null; sapm_p95: number | null
  str_def_p05: number | null; str_def_p95: number | null
  td_avg_p05: number | null; td_avg_p95: number | null
  td_acc_p05: number | null; td_acc_p95: number | null
  td_def_p05: number | null; td_def_p95: number | null
  sub_avg_p05: number | null; sub_avg_p95: number | null
  finish_mix_p05: number | null; finish_mix_p95: number | null
  avg_ko_rate: number | null; avg_sub_rate: number | null
}

// ── 유틸 ──────────────────────────────────────────────────────────────

function round2(v: number): number { return Math.round(v * 100) / 100 }
function clamp(v: number, min = 0, max = 100): number { return Math.min(Math.max(v, min), max) }
function toSlug(nameEn: string | null): string | null {
  if (!nameEn) return null
  return nameEn.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || null
}

// ── 단위 변환 ──────────────────────────────────────────────────────────

function parseHeightCm(raw: string | null | undefined): number | null {
  if (!raw) return null
  const cm = raw.match(/(\d+(?:\.\d+)?)\s*cm/i); if (cm) return round2(parseFloat(cm[1]))
  const fi = raw.match(/(\d+)'\s*(\d+(?:\.\d+)?)?"?/); if (fi) return round2(parseFloat(fi[1]) * 30.48 + parseFloat(fi[2] ?? '0') * 2.54)
  return null
}
function parseWeightKg(raw: string | null | undefined): number | null {
  if (!raw) return null
  const kg = raw.match(/(\d+(?:\.\d+)?)\s*kg/i); if (kg) return round2(parseFloat(kg[1]))
  const lb = raw.match(/(\d+(?:\.\d+)?)\s*(?:lb|lbs)\b/i); if (lb) return round2(parseFloat(lb[1]) * 0.453592)
  return null
}
function parseReachCm(raw: string | null | undefined): number | null {
  if (!raw) return null
  const cm = raw.match(/(\d+(?:\.\d+)?)\s*cm/i); if (cm) return round2(parseFloat(cm[1]))
  const inch = raw.match(/(\d+(?:\.\d+)?)\s*(?:"|in)\b/i); if (inch) return round2(parseFloat(inch[1]) * 2.54)
  return null
}

// ── ESPN API 통신 ──────────────────────────────────────────────────────

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0',
      'Accept': 'application/json,*/*',
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`)
  return res.json()
}

async function lookupEspnId(nameEn: string): Promise<string | null> {
  const url = `${ESPN_API}/athletes?search=${encodeURIComponent(nameEn)}&limit=5`
  const json = await fetchJson(url) as Record<string, unknown>
  const items = (json?.athletes ?? json?.items ?? []) as Array<Record<string, unknown>>
  if (!items.length) return null
  const target = nameEn.toLowerCase()
  const match  = items.find(a => ((a.fullName ?? a.displayName ?? '') as string).toLowerCase() === target) ?? items[0]
  return (match?.id as string) ?? null
}

interface EspnStats {
  heightCm: number | null; weightKg: number | null; reachCm: number | null
  slpm: number | null; sapm: number | null; strAcc: number | null; strDef: number | null
  tdAvg: number | null; tdAcc: number | null; tdDef: number | null; subAvg: number | null
  koRate: number | null; subRate: number | null; decRate: number | null
  rawHeight: string | null; rawWeight: string | null; rawReach: string | null
}

function extractStat(categories: Array<Record<string, unknown>>, catName: string, statName: string): number | null {
  for (const cat of categories) {
    const name = ((cat.name ?? cat.displayName ?? '') as string).toLowerCase()
    if (!name.includes(catName.toLowerCase())) continue
    const stats = (cat.stats ?? cat.values ?? []) as Array<Record<string, unknown>>
    const labels = (cat.labels ?? cat.names ?? []) as string[]
    for (let i = 0; i < labels.length; i++) {
      if (labels[i]?.toLowerCase().includes(statName.toLowerCase())) {
        const v = parseFloat(String(stats[i]?.value ?? stats[i] ?? ''))
        return Number.isFinite(v) ? round2(v) : null
      }
    }
  }
  return null
}

async function fetchEspnAthleteStats(espnId: string): Promise<EspnStats> {
  // 1. 개요 (신체 정보)
  const overview = await fetchJson(`${ESPN_WEB}/athletes/${espnId}/overview`) as Record<string, unknown>
  const athlete  = (overview?.athlete ?? {}) as Record<string, unknown>

  const rawHeight = athlete.displayHeight as string ?? null
  const rawWeight = athlete.displayWeight as string ?? null
  const rawReach  = null  // ESPN은 reach 없는 경우 많음

  const heightCm = parseHeightCm(rawHeight)
  const weightKg = parseWeightKg(rawWeight)
  const reachCm  = parseReachCm(rawReach)

  // 2. 커리어 스탯
  const statsData = await fetchJson(`${ESPN_WEB}/athletes/${espnId}/stats`) as Record<string, unknown>
  const categories = (statsData?.stats?.categories ?? statsData?.categories ?? []) as Array<Record<string, unknown>>

  const slpm   = extractStat(categories, 'striking', 'slpm') ?? extractStat(categories, 'striking', 'per min')
  const sapm   = extractStat(categories, 'striking', 'sapm') ?? extractStat(categories, 'striking', 'absorbed')
  const strAcc = extractStat(categories, 'striking', 'acc')
  const strDef = extractStat(categories, 'striking', 'def')
  const tdAvg  = extractStat(categories, 'takedown', 'avg') ?? extractStat(categories, 'grappling', 'td avg')
  const tdAcc  = extractStat(categories, 'takedown', 'acc') ?? extractStat(categories, 'grappling', 'td acc')
  const tdDef  = extractStat(categories, 'takedown', 'def') ?? extractStat(categories, 'grappling', 'td def')
  const subAvg = extractStat(categories, 'submission', 'avg') ?? extractStat(categories, 'grappling', 'sub')

  // 3. 승리 방법 (wins 분석)
  const record    = (statsData?.stats?.wins ?? overview?.stats?.wins) as Record<string, unknown> | undefined
  const totalWins = parseFloat(String(record?.total ?? athlete.wins ?? 0))
  const koWins    = parseFloat(String(record?.byKnockout ?? record?.ko ?? 0))
  const subWins   = parseFloat(String(record?.bySubmission ?? record?.sub ?? 0))
  const decWins   = parseFloat(String(record?.byDecision ?? record?.dec ?? 0))

  const koRate  = totalWins > 0 ? round2((koWins  / totalWins) * 100) : null
  const subRate = totalWins > 0 ? round2((subWins / totalWins) * 100) : null
  const decRate = totalWins > 0 ? round2((decWins / totalWins) * 100) : null

  return {
    rawHeight, rawWeight, rawReach,
    heightCm, weightKg, reachCm,
    slpm, sapm, strAcc, strDef,
    tdAvg, tdAcc, tdDef, subAvg,
    koRate, subRate, decRate,
  }
}

// ── 점수 계산 ──────────────────────────────────────────────────────────

function normHi(v: number, p05: number, p95: number) { return clamp((100 * (v - p05)) / (p95 - p05)) }
function normLo(v: number, p05: number, p95: number) { return clamp((100 * (p95 - v)) / (p95 - p05)) }

function normMetric(value: number | null, p05: number | null, p95: number | null, fixedMax: number, lowerIsBetter = false): number | null {
  if (value === null || !Number.isFinite(value)) return null
  if (p05 !== null && p95 !== null && p95 > p05)
    return lowerIsBetter ? normLo(value, p05, p95) : normHi(value, p05, p95)
  return lowerIsBetter ? clamp(100 * (1 - value / fixedMax)) : clamp(100 * value / fixedMax)
}

function weightedAvg(items: Array<{ value: number | null; w: number }>, fallback = 50): number {
  let sum = 0, totalW = 0
  for (const { value, w } of items) {
    if (value === null || !Number.isFinite(value)) continue
    sum += value * w; totalW += w
  }
  return totalW > 0 ? sum / totalW : fallback
}

function powerMean(items: Array<{ value: number | null; w: number }>, pow = FINISH_POWER): number | null {
  const valid = items.filter((i): i is { value: number; w: number } => i.value !== null && Number.isFinite(i.value))
  if (!valid.length) return null
  const wTotal = valid.reduce((a, i) => a + i.w, 0)
  const wSum   = valid.reduce((a, i) => a + (i.w / wTotal) * Math.pow(i.value, pow), 0)
  return Math.pow(wSum, 1 / pow)
}

function shrinkRate(rate: number | null, wins: number | null, prior: number): number | null {
  if (rate === null || !Number.isFinite(rate)) return null
  const w = Math.max(0, wins ?? 0)
  return prior + (w / (w + SHRINKAGE_K)) * (rate - prior)
}

function computeScores(s: EspnStats | ClientStatPayload, wins: number | null, bl: FighterBaseline | null) {
  const n = (v: number | null | undefined, p05: number | null, p95: number | null, max: number, inv = false) =>
    normMetric(v ?? null, p05, p95, max, inv)

  const slpm_n   = n(s.slpm,   bl?.slpm_p05 ?? null,    bl?.slpm_p95 ?? null,    FIXED_MAX.slpm)
  const strAcc_n = n(s.strAcc, bl?.str_acc_p05 ?? null, bl?.str_acc_p95 ?? null, FIXED_MAX.strAcc)
  const sapm_inv = n(s.sapm,   bl?.sapm_p05 ?? null,    bl?.sapm_p95 ?? null,    FIXED_MAX.sapm, true)
  const strDef_n = n(s.strDef, bl?.str_def_p05 ?? null, bl?.str_def_p95 ?? null, FIXED_MAX.strDef)
  const tdAvg_n  = n(s.tdAvg,  bl?.td_avg_p05 ?? null,  bl?.td_avg_p95 ?? null,  FIXED_MAX.tdAvg)
  const tdAcc_n  = n(s.tdAcc,  bl?.td_acc_p05 ?? null,  bl?.td_acc_p95 ?? null,  FIXED_MAX.tdAcc)
  const tdDef_n  = n(s.tdDef,  bl?.td_def_p05 ?? null,  bl?.td_def_p95 ?? null,  FIXED_MAX.tdDef)
  const subAvg_n = n(s.subAvg, bl?.sub_avg_p05 ?? null, bl?.sub_avg_p95 ?? null, FIXED_MAX.subAvg)

  const koPrior  = bl?.avg_ko_rate  ?? 35
  const subPrior = bl?.avg_sub_rate ?? 20
  const finishMixRaw = powerMean([
    { value: shrinkRate(s.koRate ?? null, wins, koPrior),  w: 0.6 },
    { value: shrinkRate(s.subRate ?? null, wins, subPrior), w: 0.4 },
  ])
  const finish_n = n(finishMixRaw ?? null, bl?.finish_mix_p05 ?? null, bl?.finish_mix_p95 ?? null, FIXED_MAX.finishMix)

  const striking   = Math.round(clamp(weightedAvg([{value:slpm_n,w:.40},{value:strAcc_n,w:.30},{value:sapm_inv,w:.15},{value:strDef_n,w:.15}])))
  const wrestling  = Math.round(clamp(weightedAvg([{value:tdAvg_n,w:.55},{value:tdAcc_n,w:.30},{value:tdDef_n,w:.15}])))
  const submission = Math.round(clamp(weightedAvg([{value:subAvg_n,w:.70},{value:tdAvg_n,w:.20},{value:tdAcc_n,w:.10}])))
  const defense    = Math.round(clamp(weightedAvg([{value:sapm_inv,w:.40},{value:strDef_n,w:.30},{value:tdDef_n,w:.30}])))
  const finishing  = Math.round(clamp(weightedAvg([{value:finish_n,w:.85},{value:slpm_n,w:.10},{value:subAvg_n,w:.05}])))
  return { stats: [striking, wrestling, submission, defense, finishing], usedBaseline: !!bl }
}

// ── DB 헬퍼 ────────────────────────────────────────────────────────────

async function loadBaselines(sb: ReturnType<typeof createClient>): Promise<Map<string, FighterBaseline>> {
  const map = new Map<string, FighterBaseline>()
  const { data } = await sb.from('fighter_stat_baselines').select('*')
  for (const row of (data ?? []) as FighterBaseline[]) map.set(row.division.toLowerCase(), row)
  return map
}

interface ResolveResult { fighters: FighterRow[]; total: number; offset: number }

async function resolveFighters(sb: ReturnType<typeof createClient>, body: SyncRequest): Promise<ResolveResult> {
  if (body.slug) {
    const { data: all, error } = await sb.from('fighters').select('id,name_en,division,wins,height,reach,espn_id')
    if (error) throw new Error(error.message)
    const matched = (all ?? []).find((f: FighterRow) => toSlug(f.name_en) === body.slug)
    if (!matched) throw new Error(`fighter not found: ${body.slug}`)
    return { fighters: [matched as FighterRow], total: 1, offset: 0 }
  }
  if (!body.syncAll) throw new Error('Provide { slug } or { syncAll: true }')
  const batchSize = Math.min(body.batchSize ?? BATCH_SIZE, 50)
  const offset    = body.offset ?? 0

  let countQ = sb.from('fighters').select('id', { count: 'exact', head: true })
  if (body.division) countQ = countQ.eq('division', body.division)
  const { count } = await countQ

  let q = sb.from('fighters')
    .select('id,name_en,division,wins,height,reach,espn_id')
    .order('id').range(offset, offset + batchSize - 1)
  if (body.division) q = q.eq('division', body.division)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return { fighters: (data ?? []) as FighterRow[], total: count ?? 0, offset }
}

// ── 서버사이드 싱글 동기화 (ESPN API) ──────────────────────────────────

async function syncOneEspn(sb: ReturnType<typeof createClient>, fighter: FighterRow, baselines: Map<string, FighterBaseline>) {
  if (!fighter.name_en) throw new Error(`name_en 없음: id=${fighter.id}`)

  let espnId = fighter.espn_id ?? null
  if (!espnId) {
    espnId = await lookupEspnId(fighter.name_en)
    if (!espnId) throw new Error(`ESPN에서 ${fighter.name_en} 미발견`)
  }

  const s  = await fetchEspnAthleteStats(espnId)
  const bl = fighter.division ? baselines.get(fighter.division.toLowerCase()) ?? null : null
  const { stats, usedBaseline } = computeScores(s, fighter.wins, bl)

  const { error } = await sb.from('fighters').upsert({
    id: fighter.id, espn_id: espnId,
    height_cm: s.heightCm, weight_kg: s.weightKg, reach_cm: s.reachCm,
    slpm: s.slpm, sapm: s.sapm, str_acc: s.strAcc, str_def: s.strDef,
    td_avg: s.tdAvg, td_acc: s.tdAcc, td_def: s.tdDef, sub_avg: s.subAvg,
    ko_rate: s.koRate, sub_rate: s.subRate, dec_rate: s.decRate,
    stats, stats_updated_at: new Date().toISOString(),
  }, { onConflict: 'id' })

  if (error) throw new Error(`upsert failed: ${error.message}`)
  return { name: fighter.name_en, espnId, division: fighter.division, usedBaseline, stats }
}

// ── 클라이언트사이드 모드 (브라우저가 파싱해서 전송) ─────────────────────

async function handleClientStats(sb: ReturnType<typeof createClient>, payloads: ClientStatPayload[], baselines: Map<string, FighterBaseline>) {
  const results: unknown[] = [], errors: string[] = []
  for (const p of payloads) {
    try {
      const { data: fRow } = await sb.from('fighters').select('wins,division').eq('id', p.fighterId).single()
      const bl = fRow?.division ? baselines.get(fRow.division.toLowerCase()) ?? null : null
      const { stats, usedBaseline } = computeScores(p, fRow?.wins ?? null, bl)
      const { error } = await sb.from('fighters').upsert({
        id: p.fighterId, espn_id: p.espnId ?? null,
        height_cm: p.heightCm ?? null, weight_kg: p.weightKg ?? null, reach_cm: p.reachCm ?? null,
        slpm: p.slpm ?? null, sapm: p.sapm ?? null, str_acc: p.strAcc ?? null, str_def: p.strDef ?? null,
        td_avg: p.tdAvg ?? null, td_acc: p.tdAcc ?? null, td_def: p.tdDef ?? null, sub_avg: p.subAvg ?? null,
        ko_rate: p.koRate ?? null, sub_rate: p.subRate ?? null, dec_rate: p.decRate ?? null,
        stats, stats_updated_at: new Date().toISOString(),
      }, { onConflict: 'id' })
      if (error) throw new Error(error.message)
      results.push({ fighterId: p.fighterId, usedBaseline, stats })
    } catch (e) {
      errors.push((e instanceof Error ? e.message : String(e)))
    }
  }
  return { results, errors }
}

// ── Entry point ────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const sb = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return new Response(JSON.stringify({ error: 'Missing auth' }), { status: 401, headers: corsHeaders })
  const { data: { user }, error: authErr } = await sb.auth.getUser(authHeader.replace('Bearer ', ''))
  if (authErr || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
  const { data: userRow } = await sb.from('users').select('is_admin').eq('id', user.id).single()
  if (!userRow?.is_admin) return new Response(JSON.stringify({ error: 'Admin only' }), { status: 403, headers: corsHeaders })

  const body = await req.json().catch(() => ({})) as SyncRequest
  const baselines = await loadBaselines(sb)

  // ── 클라이언트사이드 모드: 브라우저가 직접 파싱해서 전송 ──
  if (body.clientStats && body.clientStats.length > 0) {
    const { results, errors } = await handleClientStats(sb, body.clientStats, baselines)
    return new Response(JSON.stringify({
      success: errors.length === 0, mode: 'client',
      updated: results.length, errors,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // ── 서버사이드 모드: ESPN API 직접 호출 ──
  try {
    const { fighters, total, offset } = await resolveFighters(sb, body)
    const batchSize = Math.min(body.batchSize ?? BATCH_SIZE, 50)

    if (!fighters.length) return new Response(JSON.stringify({
      success: true, done: true, mode: 'server', processed: 0, total, offset, results: [], errors: [],
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const results: unknown[] = [], errors: string[] = []
    let usedBaseline = 0, usedFallback = 0

    for (const fighter of fighters) {
      try {
        const r = await syncOneEspn(sb, fighter, baselines)
        if (r.usedBaseline) usedBaseline++; else usedFallback++
        results.push(r)
      } catch (e) {
        errors.push((e instanceof Error ? e.message : String(e)))
      }
      await new Promise(r => setTimeout(r, 300))
    }

    const nextOffset = offset + fighters.length
    const done = !body.syncAll || nextOffset >= total

    return new Response(JSON.stringify({
      success: errors.length === 0, done, mode: 'server',
      processed: fighters.length, total, offset,
      nextOffset: done ? null : nextOffset,
      updated: results.length, usedBaseline, usedFallback,
      results, errors,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
