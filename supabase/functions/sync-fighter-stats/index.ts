import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import * as cheerio from 'https://esm.sh/cheerio@1.0.0-rc.12'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

const UFCSTATS_BASE    = 'https://ufcstats.com'
const FETCH_TIMEOUT_MS = 15000
const CONCURRENCY      = 3
const BATCH_SIZE       = 15   // 한 번 호출에 처리할 파이터 수 (504 방지)
const SHRINKAGE_K      = 8
const FINISH_POWER     = 1.35

const FIXED_MAX = {
  slpm: 10, strAcc: 80, sapm: 8, strDef: 80,
  tdAvg: 6, tdAcc: 80, tdDef: 95, subAvg: 3, finishMix: 90,
}

type Root = ReturnType<typeof cheerio.load>

interface SyncRequest {
  slug?: string
  syncAll?: boolean
  division?: string
  offset?: number      // pagination cursor
  batchSize?: number   // override default BATCH_SIZE
}

interface FighterRow {
  id: string; name_en: string | null; division: string | null
  wins: number | null; height?: string | null; reach?: string | null
  ufc_stats_id?: string | null
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

interface ParsedAthleteStats {
  rawHeight: string | null; rawWeight: string | null; rawReach: string | null
  heightCm: number | null; weightKg: number | null; reachCm: number | null
  slpm: number | null; sapm: number | null
  strAcc: number | null; strDef: number | null
  tdAvg: number | null; tdAcc: number | null; tdDef: number | null
  subAvg: number | null
  koRate: number | null; subRate: number | null; decRate: number | null
}

// ── 유틸 ─────────────────────────────────────────────────────────────

function norm(v: string | null | undefined): string {
  return (v ?? '').replace(/\s+/g, ' ').trim()
}
function round2(v: number): number { return Math.round(v * 100) / 100 }
function clamp(v: number, min = 0, max = 100): number { return Math.min(Math.max(v, min), max) }

function parseStat(text: string | null | undefined): number | null {
  const t = norm(text)
  if (!t || t === '--' || t.toUpperCase() === 'N/A') return null
  const m = t.match(/-?\d+(?:\.\d+)?/)
  return m ? round2(parseFloat(m[0])) : null
}

function parsePct(text: string | null | undefined): number | null {
  const t = norm(text)
  const m = t.match(/(\d+(?:\.\d+)?)\s*%/)
  return m ? round2(parseFloat(m[1])) : null
}

// ── 단위 변환 ──────────────────────────────────────────────────────────

function parseHeightCm(raw: string | null): number | null {
  if (!raw) return null
  const cm = raw.match(/(\d+(?:\.\d+)?)\s*cm/i)
  if (cm) return round2(parseFloat(cm[1]))
  const fi = raw.match(/(\d+)'\s*(\d+(?:\.\d+)?)?"?/)
  if (fi) return round2(parseFloat(fi[1]) * 30.48 + parseFloat(fi[2] ?? '0') * 2.54)
  return null
}
function parseWeightKg(raw: string | null): number | null {
  if (!raw) return null
  const kg = raw.match(/(\d+(?:\.\d+)?)\s*kg/i); if (kg) return round2(parseFloat(kg[1]))
  const lb = raw.match(/(\d+(?:\.\d+)?)\s*(?:lb|lbs)\b/i); if (lb) return round2(parseFloat(lb[1]) * 0.453592)
  return null
}
function parseReachCm(raw: string | null): number | null {
  if (!raw) return null
  const cm = raw.match(/(\d+(?:\.\d+)?)\s*cm/i); if (cm) return round2(parseFloat(cm[1]))
  const inch = raw.match(/(\d+(?:\.\d+)?)\s*(?:"|in|inch|inches)\b/i); if (inch) return round2(parseFloat(inch[1]) * 2.54)
  return null
}

// ── HTTP ───────────────────────────────────────────────────────────────

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,*/*',
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`)
  return res.text()
}

// ── ufcstats.com 이름 → ID 매핑 ───────────────────────────────────────

function toSlug(nameEn: string | null): string | null {
  if (!nameEn) return null
  return nameEn.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || null
}

async function lookupUfcStatsId(nameEn: string): Promise<string | null> {
  const parts     = nameEn.trim().split(/\s+/)
  if (parts.length < 2) return null
  const lastName  = parts[parts.length - 1].toLowerCase()
  const firstName = parts.slice(0, -1).join(' ').toLowerCase()
  const letter    = lastName[0]

  const html = await fetchHtml(
    `${UFCSTATS_BASE}/statistics/fighters?char=${letter}&page=all`
  )
  const $ = cheerio.load(html)
  let foundId: string | null = null

  $('tr.b-statistics__table-row').each((_, row) => {
    const cells    = $(row).find('td')
    if (cells.length < 2) return
    const rowFirst = norm(cells.eq(0).text()).toLowerCase()
    const rowLast  = norm(cells.eq(1).text()).toLowerCase()
    if (rowFirst === firstName && rowLast === lastName) {
      // href는 절대 URL: http://www.ufcstats.com/fighter-details/{hex}
      const href = cells.eq(0).find('a').attr('href') ?? cells.eq(1).find('a').attr('href') ?? ''
      const m    = href.match(/fighter-details\/([a-f0-9]+)/i)
      if (m) { foundId = m[1]; return false }
    }
  })
  return foundId
}

// ── ufcstats.com 상세 페이지 파싱 ───────────────────────────────────

function parseBioItem($: Root, label: string): string | null {
  let result: string | null = null
  const labelLow = label.toLowerCase()
  $('li.b-list__box-list-item').each((_, el) => {
    const $el   = $(el)
    const title = norm($el.find('i.b-list__box-item-title').text())
    if (!title || !title.toLowerCase().includes(labelLow)) return
    // <i> 요소를 clone에서 제거한 뒤 나머지 text가 값
    const $clone = $el.clone()
    $clone.find('i').remove()
    const value = norm($clone.text())
    if (value && value !== '--') { result = value; return false }
  })
  return result
}

function parseWinMethods($: Root): { koRate: number | null; subRate: number | null; decRate: number | null } {
  let wins = 0, ko = 0, sub = 0, dec = 0

  // ufcstats 파이터 상세 페이지 fight history 테이블
  $('tr.b-fight-details__table-row__hover, tr.b-fight-details__table-row').each((_, row) => {
    const cells  = $(row).find('td')
    if (cells.length < 8) return
    // 첫 번째 셀의 링크 텍스트가 "win"이면 승리
    const resultLink = norm(cells.eq(0).find('a').first().text() || cells.eq(0).text()).toLowerCase()
    if (!resultLink.startsWith('win')) return
    wins++
    const method = norm(cells.eq(7).text()).toLowerCase()
    if (method.includes('ko') || method.includes('tko')) ko++
    else if (method.includes('sub')) sub++
    else if (method.includes('dec') || method.includes('decision') || method.includes('u-dec') || method.includes('s-dec')) dec++
  })

  if (wins === 0) return { koRate: null, subRate: null, decRate: null }
  return {
    koRate:  round2((ko  / wins) * 100),
    subRate: round2((sub / wins) * 100),
    decRate: round2((dec / wins) * 100),
  }
}

async function fetchAndParseStats(ufcStatsId: string): Promise<ParsedAthleteStats> {
  const html = await fetchHtml(`${UFCSTATS_BASE}/fighter-details/${ufcStatsId}`)
  const $    = cheerio.load(html)

  const rawHeight = parseBioItem($, 'Height')
  const rawWeight = parseBioItem($, 'Weight')
  const rawReach  = parseBioItem($, 'Reach')

  const slpmRaw   = parseBioItem($, 'SLpM')
  const strAccRaw = parseBioItem($, 'Str. Acc')
  const sapmRaw   = parseBioItem($, 'SApM')
  const strDefRaw = parseBioItem($, 'Str. Def')
  const tdAvgRaw  = parseBioItem($, 'TD Avg')
  const tdAccRaw  = parseBioItem($, 'TD Acc')
  const tdDefRaw  = parseBioItem($, 'TD Def')
  const subAvgRaw = parseBioItem($, 'Sub. Avg')

  const { koRate, subRate, decRate } = parseWinMethods($)

  return {
    rawHeight, rawWeight, rawReach,
    heightCm: parseHeightCm(rawHeight),
    weightKg: parseWeightKg(rawWeight),
    reachCm:  parseReachCm(rawReach),
    slpm:    parseStat(slpmRaw),
    sapm:    parseStat(sapmRaw),
    strAcc:  parsePct(strAccRaw),
    strDef:  parsePct(strDefRaw),
    tdAvg:   parseStat(tdAvgRaw),
    tdAcc:   parsePct(tdAccRaw),
    tdDef:   parsePct(tdDefRaw),
    subAvg:  parseStat(subAvgRaw),
    koRate, subRate, decRate,
  }
}

// ── 점수 계산 ─────────────────────────────────────────────────────────

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

function computeScores(parsed: ParsedAthleteStats, wins: number | null, bl: FighterBaseline | null) {
  const n = (v: number | null, p05: number | null, p95: number | null, max: number, inv = false) =>
    normMetric(v, p05, p95, max, inv)

  const slpm_n   = n(parsed.slpm,   bl?.slpm_p05 ?? null,    bl?.slpm_p95 ?? null,    FIXED_MAX.slpm)
  const strAcc_n = n(parsed.strAcc, bl?.str_acc_p05 ?? null, bl?.str_acc_p95 ?? null, FIXED_MAX.strAcc)
  const sapm_inv = n(parsed.sapm,   bl?.sapm_p05 ?? null,    bl?.sapm_p95 ?? null,    FIXED_MAX.sapm, true)
  const strDef_n = n(parsed.strDef, bl?.str_def_p05 ?? null, bl?.str_def_p95 ?? null, FIXED_MAX.strDef)
  const tdAvg_n  = n(parsed.tdAvg,  bl?.td_avg_p05 ?? null,  bl?.td_avg_p95 ?? null,  FIXED_MAX.tdAvg)
  const tdAcc_n  = n(parsed.tdAcc,  bl?.td_acc_p05 ?? null,  bl?.td_acc_p95 ?? null,  FIXED_MAX.tdAcc)
  const tdDef_n  = n(parsed.tdDef,  bl?.td_def_p05 ?? null,  bl?.td_def_p95 ?? null,  FIXED_MAX.tdDef)
  const subAvg_n = n(parsed.subAvg, bl?.sub_avg_p05 ?? null, bl?.sub_avg_p95 ?? null, FIXED_MAX.subAvg)

  const koPrior  = bl?.avg_ko_rate  ?? 35
  const subPrior = bl?.avg_sub_rate ?? 20

  const finishMixRaw = powerMean([
    { value: shrinkRate(parsed.koRate,  wins, koPrior),  w: 0.6 },
    { value: shrinkRate(parsed.subRate, wins, subPrior), w: 0.4 },
  ])
  const finish_n = n(finishMixRaw ?? null, bl?.finish_mix_p05 ?? null, bl?.finish_mix_p95 ?? null, FIXED_MAX.finishMix)

  const striking   = Math.round(clamp(weightedAvg([{value:slpm_n,w:.40},{value:strAcc_n,w:.30},{value:sapm_inv,w:.15},{value:strDef_n,w:.15}])))
  const wrestling  = Math.round(clamp(weightedAvg([{value:tdAvg_n,w:.55},{value:tdAcc_n,w:.30},{value:tdDef_n,w:.15}])))
  const submission = Math.round(clamp(weightedAvg([{value:subAvg_n,w:.70},{value:tdAvg_n,w:.20},{value:tdAcc_n,w:.10}])))
  const defense    = Math.round(clamp(weightedAvg([{value:sapm_inv,w:.40},{value:strDef_n,w:.30},{value:tdDef_n,w:.30}])))
  const finishing  = Math.round(clamp(weightedAvg([{value:finish_n,w:.85},{value:slpm_n,w:.10},{value:subAvg_n,w:.05}])))

  return { stats: [striking, wrestling, submission, defense, finishing], usedBaseline: !!bl }
}

// ── DB 헬퍼 ───────────────────────────────────────────────────────────

async function loadBaselines(sb: ReturnType<typeof createClient>): Promise<Map<string, FighterBaseline>> {
  const map = new Map<string, FighterBaseline>()
  const { data } = await sb.from('fighter_stat_baselines').select('*')
  for (const row of (data ?? []) as FighterBaseline[]) map.set(row.division.toLowerCase(), row)
  return map
}

interface ResolveResult { fighters: FighterRow[]; total: number; offset: number }

async function resolveFighters(sb: ReturnType<typeof createClient>, body: SyncRequest): Promise<ResolveResult> {
  if (body.slug) {
    const { data: all, error } = await sb.from('fighters').select('id,name_en,division,wins,height,reach,ufc_stats_id')
    if (error) throw new Error(error.message)
    const matched = (all ?? []).find((f: FighterRow) => toSlug(f.name_en) === body.slug)
    if (!matched) throw new Error(`fighter not found for slug: ${body.slug}`)
    return { fighters: [matched as FighterRow], total: 1, offset: 0 }
  }
  if (!body.syncAll) throw new Error('Provide { slug } or { syncAll: true }')

  const batchSize = Math.min(body.batchSize ?? BATCH_SIZE, 50)
  const offset    = body.offset ?? 0

  // 전체 수 먼저 조회
  let countQ = sb.from('fighters').select('id', { count: 'exact', head: true })
  if (body.division) countQ = countQ.eq('division', body.division)
  const { count } = await countQ

  // 배치 조회
  let q = sb.from('fighters')
    .select('id,name_en,division,wins,height,reach,ufc_stats_id')
    .order('id')
    .range(offset, offset + batchSize - 1)
  if (body.division) q = q.eq('division', body.division)
  const { data, error } = await q
  if (error) throw new Error(error.message)

  return { fighters: (data ?? []) as FighterRow[], total: count ?? 0, offset }
}

// ── 단일 파이터 동기화 ────────────────────────────────────────────────

async function syncOne(sb: ReturnType<typeof createClient>, fighter: FighterRow, baselines: Map<string, FighterBaseline>) {
  if (!fighter.name_en) throw new Error(`name_en 없음: id=${fighter.id}`)

  // ufcstats ID 확인 — 없으면 인덱스 페이지에서 탐색 후 저장
  let ufcStatsId = fighter.ufc_stats_id ?? null
  if (!ufcStatsId) {
    ufcStatsId = await lookupUfcStatsId(fighter.name_en)
    if (!ufcStatsId) throw new Error(`ufcstats에서 ${fighter.name_en} 미발견`)
    // 다음 sync에서 재사용할 수 있도록 저장
    await sb.from('fighters').update({ ufc_stats_id: ufcStatsId }).eq('id', fighter.id)
  }

  const parsed = await fetchAndParseStats(ufcStatsId)
  const bl     = fighter.division ? baselines.get(fighter.division.toLowerCase()) ?? null : null
  const { stats, usedBaseline } = computeScores(parsed, fighter.wins, bl)

  const { error } = await sb.from('fighters').upsert({
    id: fighter.id,
    ufc_stats_id: ufcStatsId,
    height:    parsed.rawHeight ?? fighter.height ?? null,
    reach:     parsed.rawReach  ?? fighter.reach  ?? null,
    height_cm: parsed.heightCm,
    weight_kg: parsed.weightKg,
    reach_cm:  parsed.reachCm,
    slpm:      parsed.slpm,
    sapm:      parsed.sapm,
    str_acc:   parsed.strAcc,
    str_def:   parsed.strDef,
    td_avg:    parsed.tdAvg,
    td_acc:    parsed.tdAcc,
    td_def:    parsed.tdDef,
    sub_avg:   parsed.subAvg,
    ko_rate:   parsed.koRate,
    sub_rate:  parsed.subRate,
    dec_rate:  parsed.decRate,
    stats,
    stats_updated_at: new Date().toISOString(),
  }, { onConflict: 'id' })

  if (error) throw new Error(`upsert failed for ${fighter.name_en}: ${error.message}`)
  return { name: fighter.name_en, ufcStatsId, division: fighter.division, usedBaseline, stats }
}

// ── Entry point ───────────────────────────────────────────────────────

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

  try {
    const { fighters, total, offset } = await resolveFighters(sb, body)
    const batchSize = Math.min(body.batchSize ?? BATCH_SIZE, 50)

    if (!fighters.length) return new Response(JSON.stringify({
      success: true, done: true, processed: 0, total, offset, results: [], errors: [],
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const baselines = await loadBaselines(sb)
    const results: unknown[] = []
    const errors:  string[]  = []
    let usedBaseline = 0, usedFallback = 0

    for (let i = 0; i < fighters.length; i += CONCURRENCY) {
      const settled = await Promise.allSettled(fighters.slice(i, i + CONCURRENCY).map(f => syncOne(sb, f, baselines)))
      for (const s of settled) {
        if (s.status === 'fulfilled') {
          if (s.value.usedBaseline) usedBaseline++; else usedFallback++
          results.push(s.value)
        } else {
          errors.push(s.reason?.message ?? String(s.reason))
        }
      }
      if (i + CONCURRENCY < fighters.length) await new Promise(r => setTimeout(r, 500))
    }

    const nextOffset = offset + fighters.length
    const done = !body.syncAll || nextOffset >= total

    return new Response(JSON.stringify({
      success: errors.length === 0,
      done,
      processed: fighters.length,
      total,
      offset,
      nextOffset: done ? null : nextOffset,
      updated: results.length,
      usedBaseline, usedFallback,
      results, errors,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
