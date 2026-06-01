import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

// ESPN Public API — 인증 불필요, JSON 응답
const ESPN_SEARCH = 'https://site.web.api.espn.com/apis/common/v3/search'
const ESPN_WEB    = 'https://site.web.api.espn.com/apis/common/v3/sports/mma/ufc'
const ESPN_CORE   = 'https://sports.core.api.espn.com/v2/sports/mma/leagues/ufc'
const FETCH_TIMEOUT_MS = 12000
const BATCH_SIZE       = 15
const SHRINKAGE_K      = 8
const FINISH_POWER     = 1.35

const FIXED_MAX = {
  slpm: 10, strAcc: 80, sapm: 8, strDef: 80,
  tdAvg: 6, tdAcc: 80, tdDef: 95, subAvg: 3, finishMix: 90,
}

// admin.js computeStatsFromPerf / admin_recompute_fighter_stats RPC와 동일한 p05/p95 fallback
const FIXED_BASELINES = {
  slpm:    { p05: 1.5,  p95: 7.5  },
  strAcc:  { p05: 28,   p95: 62   },
  sapm:    { p05: 1.5,  p95: 6.5  },
  strDef:  { p05: 45,   p95: 76   },
  tdAvg:   { p05: 0.0,  p95: 4.5  },
  tdAcc:   { p05: 15,   p95: 70   },
  tdDef:   { p05: 40,   p95: 88   },
  subAvg:  { p05: 0.0,  p95: 2.5  },
  koRate:  { p05: 0,    p95: 60   },
  decRate: { p05: 20,   p95: 80   },
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
  // ESPN 통합 검색 — type=player로 선수만 필터
  const url  = `${ESPN_SEARCH}?region=us&lang=en&query=${encodeURIComponent(nameEn)}&limit=5&mode=prefix&type=player`
  const json = await fetchJson(url) as Record<string, unknown>
  const items = (
    (json?.results as Array<Record<string, unknown>>)?.[0]?.items ??
    (json?.items as Array<Record<string, unknown>>) ??
    []
  ) as Array<Record<string, unknown>>
  if (!items.length) return null
  const target = nameEn.toLowerCase()
  // MMA/UFC 선수로 좁히기
  const mmaMatch = items.find(a => {
    const sport = ((a.sport ?? a.sportName ?? '') as string).toLowerCase()
    return sport.includes('mma') || sport.includes('ufc')
  })
  const match = mmaMatch ?? items.find(a =>
    ((a.displayName ?? a.name ?? '') as string).toLowerCase() === target
  ) ?? items[0]
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

function extractStatByLabel(labels: string[], values: unknown[], keyword: string): number | null {
  for (let i = 0; i < labels.length; i++) {
    if (labels[i]?.toLowerCase().includes(keyword.toLowerCase())) {
      const v = parseFloat(String(values[i] ?? ''))
      return Number.isFinite(v) ? round2(v) : null
    }
  }
  return null
}

async function fetchEspnAthleteStats(espnId: string): Promise<EspnStats> {
  // 1. Core athlete (신체 정보) — height/weight/reach는 숫자(인치/파운드)로 옴
  const core = await fetchJson(`${ESPN_CORE}/athletes/${espnId}`) as Record<string, unknown>

  const rawHeight = core?.displayHeight as string ?? null
  const rawWeight = core?.displayWeight as string ?? null
  const rawReach  = core?.displayReach  as string ?? null

  // ESPN Core는 height(인치), weight(파운드), reach(인치)를 숫자로 반환
  const heightNum = typeof core?.height === 'number' ? core.height as number : null
  const weightNum = typeof core?.weight === 'number' ? core.weight as number : null
  const reachNum  = typeof core?.reach  === 'number' ? core.reach  as number : null

  const heightCm = heightNum !== null ? round2(heightNum * 2.54) : parseHeightCm(rawHeight)
  const weightKg = weightNum !== null ? round2(weightNum * 0.453592) : parseWeightKg(rawWeight)
  const reachCm  = reachNum  !== null ? round2(reachNum  * 2.54) : parseReachCm(rawReach)

  // 2. Records API — KO/SUB/DEC 승리수 (실제 응답 구조 확인됨)
  const recordsData = await fetchJson(`${ESPN_CORE}/athletes/${espnId}/records?lang=en&region=us`) as Record<string, unknown>
  const items = (recordsData?.items ?? []) as Array<Record<string, unknown>>
  const recordStats = (items[0]?.stats ?? []) as Array<Record<string, unknown>>
  const getStat = (name: string): number => {
    const s = recordStats.find((r) => r.name === name)
    return typeof s?.value === 'number' ? s.value as number : 0
  }

  const totalWins = getStat('wins')
  const koWins    = getStat('tkos')
  const subWins   = getStat('submissions')
  const decWins   = Math.max(0, totalWins - koWins - subWins)

  const koRate  = totalWins > 0 ? round2((koWins  / totalWins) * 100) : null
  const subRate = totalWins > 0 ? round2((subWins / totalWins) * 100) : null
  const decRate = totalWins > 0 ? round2((decWins / totalWins) * 100) : null

  // slpm/sapm/strAcc 등은 ESPN API에서 제공 안 함 — FIXED_MAX 폴백 사용
  return {
    rawHeight, rawWeight, rawReach,
    heightCm, weightKg, reachCm,
    slpm: null, sapm: null, strAcc: null, strDef: null,
    tdAvg: null, tdAcc: null, tdDef: null, subAvg: null,
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

// canonical [Striking, Grappling, Stamina, Defense, Speed]
// admin.js computeStatsFromPerf / admin_recompute_fighter_stats RPC와 동일한 의미·가중치·clamp [45,98]
function computeScores(s: EspnStats | ClientStatPayload, _wins: number | null, bl: FighterBaseline | null) {
  const fb = FIXED_BASELINES
  const n = (v: number | null | undefined, p05: number | null, p95: number | null, max: number, inv = false) =>
    normMetric(v ?? null, p05, p95, max, inv)

  // division baseline 우선, 없으면 FIXED_BASELINES (admin.js FIGHTER_STAT_FALLBACK_BASELINES와 동일)
  const slpm_n   = n(s.slpm,   bl?.slpm_p05   ?? fb.slpm.p05,   bl?.slpm_p95   ?? fb.slpm.p95,   FIXED_MAX.slpm)
  const strAcc_n = n(s.strAcc, bl?.str_acc_p05 ?? fb.strAcc.p05, bl?.str_acc_p95 ?? fb.strAcc.p95, FIXED_MAX.strAcc)
  const sapm_inv = n(s.sapm,   bl?.sapm_p05   ?? fb.sapm.p05,   bl?.sapm_p95   ?? fb.sapm.p95,   FIXED_MAX.sapm, true)
  const strDef_n = n(s.strDef, bl?.str_def_p05 ?? fb.strDef.p05, bl?.str_def_p95 ?? fb.strDef.p95, FIXED_MAX.strDef)
  const tdAvg_n  = n(s.tdAvg,  bl?.td_avg_p05  ?? fb.tdAvg.p05,  bl?.td_avg_p95  ?? fb.tdAvg.p95,  FIXED_MAX.tdAvg)
  const tdAcc_n  = n(s.tdAcc,  bl?.td_acc_p05  ?? fb.tdAcc.p05,  bl?.td_acc_p95  ?? fb.tdAcc.p95,  FIXED_MAX.tdAcc)
  const tdDef_n  = n(s.tdDef,  bl?.td_def_p05  ?? fb.tdDef.p05,  bl?.td_def_p95  ?? fb.tdDef.p95,  FIXED_MAX.tdDef)
  const subAvg_n = n(s.subAvg, bl?.sub_avg_p05 ?? fb.subAvg.p05, bl?.sub_avg_p95 ?? fb.subAvg.p95, FIXED_MAX.subAvg)
  // ko_rate / dec_rate: FighterBaseline에 p05/p95 없음 — FIXED_BASELINES 고정 사용
  const koRate_n  = n(s.koRate  ?? null, fb.koRate.p05,  fb.koRate.p95,  100)
  const decRate_n = n(s.decRate ?? null, fb.decRate.p05, fb.decRate.p95, 100)

  const striking  = Math.round(clamp(weightedAvg([{value:slpm_n,  w:.55},{value:strAcc_n, w:.45}]),                           45, 98))
  const grappling = Math.round(clamp(weightedAvg([{value:tdAvg_n, w:.45},{value:tdAcc_n,  w:.35},{value:subAvg_n, w:.20}]),   45, 98))
  const stamina   = Math.round(clamp(weightedAvg([{value:sapm_inv,w:.60},{value:decRate_n,w:.40}]),                           45, 98))
  const defense   = Math.round(clamp(weightedAvg([{value:strDef_n,w:.60},{value:tdDef_n,  w:.40}]),                           45, 98))
  const speed     = Math.round(clamp(weightedAvg([{value:slpm_n,  w:.40},{value:koRate_n, w:.35},{value:strAcc_n, w:.25}]),   45, 98))
  return { stats: [striking, grappling, stamina, defense, speed], usedBaseline: !!bl }
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

  const s = await fetchEspnAthleteStats(espnId)

  // server mode: ESPN은 raw 8필드(slpm/sapm/str_acc 등)를 제공하지 않음.
  // stats 배열은 raw가 있는 client 모드 또는 admin_recompute_fighter_stats RPC에서만 갱신.
  // 여기서는 신체정보·finish rate·espn_id만 업데이트해 기존 stats를 보존.
  const updatePayload: Record<string, unknown> = {
    espn_id: espnId,
    height_cm: s.heightCm, weight_kg: s.weightKg, reach_cm: s.reachCm,
    ko_rate: s.koRate, sub_rate: s.subRate, dec_rate: s.decRate,
  }
  // null 스탯은 기존 DB 값 보존 (나중에 다른 소스로 채울 수 있게)
  if (s.slpm   !== null) updatePayload.slpm    = s.slpm
  if (s.sapm   !== null) updatePayload.sapm    = s.sapm
  if (s.strAcc !== null) updatePayload.str_acc = s.strAcc
  if (s.strDef !== null) updatePayload.str_def = s.strDef
  if (s.tdAvg  !== null) updatePayload.td_avg  = s.tdAvg
  if (s.tdAcc  !== null) updatePayload.td_acc  = s.tdAcc
  if (s.tdDef  !== null) updatePayload.td_def  = s.tdDef
  if (s.subAvg !== null) updatePayload.sub_avg = s.subAvg

  const { error } = await sb.from('fighters').update(updatePayload).eq('id', fighter.id)
  if (error) throw new Error(`upsert failed: ${error.message}`)
  return { name: fighter.name_en, espnId, division: fighter.division, usedBaseline: false, stats: null }
}

// ── 클라이언트사이드 모드 (브라우저가 파싱해서 전송) ─────────────────────

async function handleClientStats(sb: ReturnType<typeof createClient>, payloads: ClientStatPayload[], baselines: Map<string, FighterBaseline>) {
  const results: unknown[] = [], errors: string[] = []
  for (const p of payloads) {
    try {
      const { data: fRow } = await sb.from('fighters').select('wins,division').eq('id', p.fighterId).single()
      const bl = fRow?.division ? baselines.get(fRow.division.toLowerCase()) ?? null : null
      const { stats, usedBaseline } = computeScores(p, fRow?.wins ?? null, bl)
      const { error } = await sb.from('fighters').update({
        espn_id: p.espnId ?? null,
        height_cm: p.heightCm ?? null, weight_kg: p.weightKg ?? null, reach_cm: p.reachCm ?? null,
        slpm: p.slpm ?? null, sapm: p.sapm ?? null, str_acc: p.strAcc ?? null, str_def: p.strDef ?? null,
        td_avg: p.tdAvg ?? null, td_acc: p.tdAcc ?? null, td_def: p.tdDef ?? null, sub_avg: p.subAvg ?? null,
        ko_rate: p.koRate ?? null, sub_rate: p.subRate ?? null, dec_rate: p.decRate ?? null,
        stats, stats_updated_at: new Date().toISOString(),
      }).eq('id', p.fighterId)
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
