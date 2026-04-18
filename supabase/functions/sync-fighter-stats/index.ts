import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import * as cheerio from 'https://esm.sh/cheerio@1.0.0-rc.12'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

const ATHLETE_BASE_URL = 'https://kr.ufc.com/athlete'
const FETCH_TIMEOUT_MS = 20000
const CONCURRENCY = 5
const SHRINKAGE_K = 8
const FINISH_POWER = 1.35

// 체급별 baseline 없을 때 폴백용 절대 max 값
const FIXED_MAX = {
  slpm: 10,
  strAcc: 80,
  sapm: 8,
  strDef: 80,
  tdAvg: 6,
  tdAcc: 80,
  tdDef: 95,
  subAvg: 3,
  finishMix: 90,
}

type Root = ReturnType<typeof cheerio.load>

interface SyncRequest {
  slug?: string
  syncAll?: boolean
  division?: string
}

interface FighterRow {
  id: string
  division: string | null
  wins: number | null
  height?: string | null
  reach?: string | null
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
  avg_ko_rate: number | null
  avg_sub_rate: number | null
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

// ── 유틸 ──────────────────────────────────────────────────────────

function normalizeText(v: string | null | undefined): string {
  return (v ?? '').replace(/\s+/g, ' ').trim()
}
function round2(v: number): number { return Math.round(v * 100) / 100 }
function clamp(v: number, min = 0, max = 100): number { return Math.min(Math.max(v, min), max) }

function parseStatNumber(text: string | null | undefined): number | null {
  const t = normalizeText(text)
  if (!t || t === '--' || t.toUpperCase() === 'N/A') return null
  const m = t.match(/-?\d+(?:\.\d+)?/)
  return m ? round2(parseFloat(m[0])) : null
}

// ── 단위 변환 파서 ────────────────────────────────────────────────

function parseHeightCm(raw: string | null): number | null {
  if (!raw) return null
  const cm = raw.match(/(\d+(?:\.\d+)?)\s*cm/i)
  if (cm) return round2(parseFloat(cm[1]))
  const fi = raw.match(/(\d+)\s*'\s*(\d+(?:\.\d+)?)?/)
  if (fi) return round2(parseFloat(fi[1]) * 30.48 + parseFloat(fi[2] ?? '0') * 2.54)
  return null
}

function parseWeightKg(raw: string | null): number | null {
  if (!raw) return null
  const kg = raw.match(/(\d+(?:\.\d+)?)\s*kg/i)
  if (kg) return round2(parseFloat(kg[1]))
  const lb = raw.match(/(\d+(?:\.\d+)?)\s*(?:lb|lbs)\b/i)
  if (lb) return round2(parseFloat(lb[1]) * 0.453592)
  return null
}

function parseReachCm(raw: string | null): number | null {
  if (!raw) return null
  const cm = raw.match(/(\d+(?:\.\d+)?)\s*cm/i)
  if (cm) return round2(parseFloat(cm[1]))
  const inch = raw.match(/(\d+(?:\.\d+)?)\s*(?:"|in|inch|inches)\b/i)
  if (inch) return round2(parseFloat(inch[1]) * 2.54)
  return null
}

// ── 페이지 파싱 ───────────────────────────────────────────────────

function parseOrderedMetrics($: Root, selector: string, count: number): Array<number | null> {
  const vals = $(selector).map((_, el) => parseStatNumber($(el).text())).get()
  const result: Array<number | null> = new Array(count).fill(null)
  for (let i = 0; i < Math.min(vals.length, count); i++) result[i] = vals[i]
  return result
}

function collectShortBlocks($: Root): string[] {
  const seen = new Set<string>()
  $('body *').each((_, el) => {
    const t = normalizeText($(el).text())
    if (t && t.length <= 140 && /\d/.test(t)) seen.add(t)
  })
  return Array.from(seen)
}

function parseRateFromBlocks(blocks: string[], labels: string[]): number | null {
  for (const b of blocks) {
    const lower = b.toLowerCase()
    if (!labels.some(l => lower.includes(l))) continue
    const m = b.match(/(\d+(?:\.\d+)?)\s*%/)
    if (m) return round2(parseFloat(m[1]))
  }
  return null
}

function parseAthletePage(html: string): ParsedAthleteStats {
  const $ = cheerio.load(html)

  // 피지컬
  let rawHeight: string | null = null
  let rawWeight: string | null = null
  let rawReach: string | null  = null

  $('.c-stat-compare__group').each((_, el) => {
    const text  = normalizeText($(el).text())
    const lower = text.toLowerCase()
    if (!rawHeight && (lower.includes('height') || text.includes('키')))
      rawHeight = text.match(/\d+['ft][\s\d"incm.]+/i)?.[0] ?? text.match(/\d+(?:\.\d+)?\s*cm/i)?.[0] ?? null
    if (!rawWeight && (lower.includes('weight') || text.includes('무게')))
      rawWeight = text.match(/\d+(?:\.\d+)?\s*(?:lb|lbs|kg)\b/i)?.[0] ?? null
    if (!rawReach && (lower.includes('reach') || text.includes('리치')))
      rawReach  = text.match(/\d+(?:\.\d+)?\s*(?:"|in|cm)\b/i)?.[0] ?? null
  })

  // 타격 스탯: SLpM, SApM, Str.Acc%, Str.Def%
  const [slpm, sapm, strAcc, strDef] = parseOrderedMetrics($, '.c-stat-3bar__value', 4)

  // 레슬링/서브: TD Avg, TD Acc%, TD Def%, Sub.Avg
  const [tdAvg, tdAcc, tdDef, subAvg] = parseOrderedMetrics($, '.c-stat-compare__number', 4)

  // 승리 방법 비율
  const blocks = collectShortBlocks($)
  const koRate  = parseRateFromBlocks(blocks, ['ko/tko', 'ko tko', 'ko'])
  const subRate = parseRateFromBlocks(blocks, ['submission', 'sub', '서브'])
  let decRate   = parseRateFromBlocks(blocks, ['decision', 'dec', '판정'])
  if (decRate === null && koRate !== null && subRate !== null)
    decRate = round2(clamp(100 - koRate - subRate, 0, 100))

  return {
    rawHeight, rawWeight, rawReach,
    heightCm: parseHeightCm(rawHeight),
    weightKg: parseWeightKg(rawWeight),
    reachCm:  parseReachCm(rawReach),
    slpm, sapm, strAcc, strDef,
    tdAvg, tdAcc, tdDef, subAvg,
    koRate, subRate, decRate,
  }
}

// ── 점수 계산 ─────────────────────────────────────────────────────

function normHi(v: number, p05: number, p95: number) { return clamp((100 * (v - p05)) / (p95 - p05)) }
function normLo(v: number, p05: number, p95: number) { return clamp((100 * (p95 - v)) / (p95 - p05)) }

function normMetric(
  value: number | null,
  p05: number | null, p95: number | null,
  fixedMax: number,
  lowerIsBetter = false,
): number | null {
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

  const slpm_n    = n(parsed.slpm,   bl?.slpm_p05    ?? null, bl?.slpm_p95    ?? null, FIXED_MAX.slpm)
  const strAcc_n  = n(parsed.strAcc, bl?.str_acc_p05 ?? null, bl?.str_acc_p95 ?? null, FIXED_MAX.strAcc)
  const sapm_inv  = n(parsed.sapm,   bl?.sapm_p05    ?? null, bl?.sapm_p95    ?? null, FIXED_MAX.sapm, true)
  const strDef_n  = n(parsed.strDef, bl?.str_def_p05 ?? null, bl?.str_def_p95 ?? null, FIXED_MAX.strDef)
  const tdAvg_n   = n(parsed.tdAvg,  bl?.td_avg_p05  ?? null, bl?.td_avg_p95  ?? null, FIXED_MAX.tdAvg)
  const tdAcc_n   = n(parsed.tdAcc,  bl?.td_acc_p05  ?? null, bl?.td_acc_p95  ?? null, FIXED_MAX.tdAcc)
  const tdDef_n   = n(parsed.tdDef,  bl?.td_def_p05  ?? null, bl?.td_def_p95  ?? null, FIXED_MAX.tdDef)
  const subAvg_n  = n(parsed.subAvg, bl?.sub_avg_p05 ?? null, bl?.sub_avg_p95 ?? null, FIXED_MAX.subAvg)

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

// ── HTTP 헬퍼 ─────────────────────────────────────────────────────

async function fetchAthleteHtml(slug: string): Promise<string> {
  const res = await fetch(`${ATHLETE_BASE_URL}/${slug}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8',
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`athlete ${slug}: HTTP ${res.status}`)
  return res.text()
}

async function loadBaselines(sb: ReturnType<typeof createClient>): Promise<Map<string, FighterBaseline>> {
  const map = new Map<string, FighterBaseline>()
  const { data } = await sb.from('fighter_stat_baselines').select('*')
  for (const row of (data ?? []) as FighterBaseline[]) map.set(row.division.toLowerCase(), row)
  return map
}

async function resolveFighters(sb: ReturnType<typeof createClient>, body: SyncRequest): Promise<FighterRow[]> {
  if (body.slug) {
    const { data, error } = await sb.from('fighters').select('id,division,wins,height,reach').eq('id', body.slug).maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) throw new Error(`fighter not found: ${body.slug}`)
    return [data as FighterRow]
  }
  if (!body.syncAll) throw new Error('Provide { slug } or { syncAll: true }')
  let q = sb.from('fighters').select('id,division,wins,height,reach').order('id').limit(5000)
  if (body.division) q = q.eq('division', body.division)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []) as FighterRow[]
}

async function syncOne(sb: ReturnType<typeof createClient>, fighter: FighterRow, baselines: Map<string, FighterBaseline>) {
  const html   = await fetchAthleteHtml(fighter.id)
  const parsed = parseAthletePage(html)
  const bl     = fighter.division ? baselines.get(fighter.division.toLowerCase()) ?? null : null
  const { stats, usedBaseline } = computeScores(parsed, fighter.wins, bl)

  const { error } = await sb.from('fighters').upsert({
    id: fighter.id,
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

  if (error) throw new Error(`upsert failed for ${fighter.id}: ${error.message}`)
  return { slug: fighter.id, division: fighter.division, usedBaseline, stats }
}

// ── Entry point ───────────────────────────────────────────────────

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
    const fighters  = await resolveFighters(sb, body)
    if (!fighters.length) return new Response(JSON.stringify({ success: true, processed: 0, results: [], errors: [] }), { headers: corsHeaders })

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
      if (i + CONCURRENCY < fighters.length) await new Promise(r => setTimeout(r, 250))
    }

    return new Response(JSON.stringify({
      success: errors.length === 0,
      processed: fighters.length,
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
