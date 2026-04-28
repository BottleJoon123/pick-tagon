import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import * as cheerio from 'https://esm.sh/cheerio@1.0.0-rc.12'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const UFC_STATS_BASE = 'http://ufcstats.com/statistics/fighters?char='
const UFC_STATS_SUFFIX = '&page=all'
const LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('')
const CONCURRENCY = 4   // UFC Stats 동시 요청 수
const FETCH_TIMEOUT = 20000

// "5' 10"" → cm
function ftInToCm(raw: string): number | null {
  const m = raw.match(/(\d+)'\s*(\d+(?:\.\d+)?)[""]?/)
  if (!m) return null
  const cm = parseInt(m[1]) * 30.48 + parseFloat(m[2]) * 2.54
  return Math.round(cm * 100) / 100
}

// "70.0"" → cm
function inchesToCm(raw: string): number | null {
  const m = raw.match(/(\d+(?:\.\d+)?)[""]/)
  if (!m) return null
  return Math.round(parseFloat(m[1]) * 2.54 * 100) / 100
}

// 이름 정규화: Unicode 분해 → combining 제거 → 소문자, suffix 제거
function normalizeName(s: string): string {
  return s
    .normalize('NFD')                            // 악센트 분해 (é → e + combining)
    .replace(/[̀-ͯ]/g, '')            // combining 제거
    .toLowerCase()
    .replace(/\s+jr\.?$|\s+sr\.?$|\s+ii$|\s+iii$|\s+iv$/i, '')
    .replace(/[^a-z\s'-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

interface FighterData {
  heightCm: number | null
  reachCm:  number | null
}

async function scrapeLetter(char: string): Promise<Map<string, FighterData>> {
  const map = new Map<string, FighterData>()
  const url = `${UFC_STATS_BASE}${char}${UFC_STATS_SUFFIX}`

  let html: string
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    html = await res.text()
  } catch {
    return map  // 실패한 letter는 skip
  }

  const $ = cheerio.load(html)

  // 각 행: td[0]=First, td[1]=Last, td[2]=Nickname, td[3]=Ht, td[4]=Wt, td[5]=Reach
  $('tbody tr').each((_, row) => {
    const tds = $(row).find('td.b-statistics__table-col')
    if (tds.length < 6) return

    const firstName = tds.eq(0).text().trim()
    const lastName  = tds.eq(1).text().trim()
    if (!firstName && !lastName) return

    const heightRaw = tds.eq(3).text().trim()
    const reachRaw  = tds.eq(5).text().trim()

    const fullName  = normalizeName(`${firstName} ${lastName}`)
    const heightCm  = ftInToCm(heightRaw)
    const reachCm   = inchesToCm(reachRaw)

    if (fullName) {
      map.set(fullName, { heightCm, reachCm })
    }
  })

  return map
}

// 동시 요청 제한 유틸
async function pMap<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number
): Promise<R[]> {
  const results: R[] = []
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency)
    const batchResults = await Promise.all(batch.map(fn))
    results.push(...batchResults)
  }
  return results
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  // chars 파라미터로 특정 글자만 처리 가능 (기본: 전체 a-z)
  const chars: string[] = Array.isArray(body.chars)
    ? (body.chars as string[]).map((c: string) => c.toLowerCase()).filter(c => /^[a-z]$/.test(c))
    : LETTERS

  // ── 1. UFC Stats 전체 스크래핑 (지정 letters) ─────────────────────
  const allMaps = await pMap(chars, scrapeLetter, CONCURRENCY)

  // 전체 이름→데이터 맵 병합
  const ufcStatsMap = new Map<string, FighterData>()
  for (const m of allMaps) {
    for (const [name, data] of m) {
      ufcStatsMap.set(name, data)
    }
  }

  // ── 2. DB에서 height_cm IS NULL 파이터 가져오기 ──────────────────
  const { data: rows, error: fetchErr, count } = await admin
    .from('fighters')
    .select('id, name_en', { count: 'exact' })
    .is('height_cm', null)
    .not('name_en', 'is', null)

  if (fetchErr) {
    return new Response(
      JSON.stringify({ ok: false, error: fetchErr.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const fighters = rows ?? []

  // ── 3. 이름 매칭 + DB 업데이트 ────────────────────────────────────
  const found:    string[] = []
  const notFound: string[] = []
  const errors:   string[] = []

  for (const fighter of fighters) {
    const key = normalizeName(fighter.name_en ?? '')
    const data = ufcStatsMap.get(key)

    if (!data || (data.heightCm === null && data.reachCm === null)) {
      notFound.push(fighter.name_en)
      continue
    }

    const updatePayload: Record<string, unknown> = {}
    if (data.heightCm !== null) {
      updatePayload.height_cm = data.heightCm
      updatePayload.height    = `${Math.round(data.heightCm)} cm`
    }
    if (data.reachCm !== null) {
      updatePayload.reach_cm = data.reachCm
      updatePayload.reach    = `${Math.round(data.reachCm)} cm`
    }

    const { error: upErr } = await admin
      .from('fighters')
      .update(updatePayload)
      .eq('id', fighter.id)

    if (upErr) {
      errors.push(`${fighter.name_en}: ${upErr.message}`)
    } else {
      found.push(fighter.name_en)
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      scraped: ufcStatsMap.size,
      targetFighters: fighters.length,
      found:    found.length,
      foundList: found,
      notFound,
      errors,
      total:    count ?? 0,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
