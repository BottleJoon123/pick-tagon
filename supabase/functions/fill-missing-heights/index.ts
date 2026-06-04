import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import * as cheerio from 'https://esm.sh/cheerio@1.0.0-rc.12'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const UFC_STATS_BASE   = 'https://www.ufcstats.com/statistics/fighters?char='
const UFC_STATS_SUFFIX = '&page=all'
const LETTERS          = 'abcdefghijklmnopqrstuvwxyz'.split('')
const CONCURRENCY      = 4
const FETCH_TIMEOUT    = 20000

// 유효 신체치수 범위 (이상치·악성 값 필터)
const HEIGHT_MIN_CM = 130
const HEIGHT_MAX_CM = 230
const REACH_MIN_CM  = 130
const REACH_MAX_CM  = 250

function ftInToCm(raw: string): number | null {
  const m = raw.match(/(\d+)'\s*(\d+(?:\.\d+)?)[""]?/)
  if (!m) return null
  const cm = parseInt(m[1]) * 30.48 + parseFloat(m[2]) * 2.54
  if (cm < HEIGHT_MIN_CM || cm > HEIGHT_MAX_CM) return null
  return Math.round(cm * 100) / 100
}

function inchesToCm(raw: string): number | null {
  const m = raw.match(/(\d+(?:\.\d+)?)[""]/)
  if (!m) return null
  const cm = Math.round(parseFloat(m[1]) * 2.54 * 100) / 100
  if (cm < REACH_MIN_CM || cm > REACH_MAX_CM) return null
  return cm
}

function normalizeName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')    // combining diacritics 제거
    .toLowerCase()
    .replace(/\s+jr\.?$|\s+sr\.?$|\s+ii$|\s+iii$|\s+iv$/i, '')
    .replace(/[^a-z\s'-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

interface FighterData { heightCm: number | null; reachCm: number | null }

async function scrapeLetter(char: string): Promise<{ map: Map<string, FighterData>; ok: boolean }> {
  const map = new Map<string, FighterData>()
  const url = `${UFC_STATS_BASE}${char}${UFC_STATS_SUFFIX}`

  let html: string
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; pick-tagon-bot/1.0)' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    })
    if (!res.ok) return { map, ok: false }
    html = await res.text()
  } catch {
    return { map, ok: false }
  }

  const $ = cheerio.load(html)
  const seen = new Set<string>()

  $('tbody tr').each((_, row) => {
    const tds = $(row).find('td.b-statistics__table-col')
    if (tds.length < 6) return

    const firstName = tds.eq(0).text().trim()
    const lastName  = tds.eq(1).text().trim()
    if (!firstName && !lastName) return

    const fullName = normalizeName(`${firstName} ${lastName}`)
    if (!fullName) return

    // 동일 정규화 이름 충돌 시 양쪽 모두 skip (잘못 매칭 방지)
    if (seen.has(fullName)) {
      map.delete(fullName)
      return
    }
    seen.add(fullName)

    const heightCm = ftInToCm(tds.eq(3).text().trim())
    const reachCm  = inchesToCm(tds.eq(5).text().trim())
    map.set(fullName, { heightCm, reachCm })
  })

  return { map, ok: true }
}

async function pMap<T, R>(items: T[], fn: (item: T) => Promise<R>, concurrency: number): Promise<R[]> {
  const results: R[] = []
  for (let i = 0; i < items.length; i += concurrency) {
    const batchResults = await Promise.all(items.slice(i, i + concurrency).map(fn))
    results.push(...batchResults)
  }
  return results
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // POST만 허용
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders })
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // ── 인증 (fail closed) ──────────────────────────────────────────────
  // 경로 1: 서버 전용 ADMIN_SECRET (cron/수동) — env가 설정되고 헤더가 일치할 때만.
  // 경로 2: 관리자 JWT (users.is_admin).
  // 둘 다 아니면 거부. ADMIN_SECRET 미설정이어도 공개 실행되지 않는다.
  const adminSecret = Deno.env.get('ADMIN_SECRET')
  const secretOk = !!adminSecret && req.headers.get('x-admin-secret') === adminSecret

  if (!secretOk) {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ ok: false, error: 'Missing auth' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const { data: { user }, error: authErr } = await admin.auth.getUser(authHeader.replace('Bearer ', ''))
    if (authErr || !user) {
      return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const { data: userRow } = await admin.from('users').select('is_admin').eq('id', user.id).single()
    if (!userRow?.is_admin) {
      return new Response(JSON.stringify({ ok: false, error: 'Admin only' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>

  // chars: 중복 제거, 타입 검증, 최대 26개
  const chars: string[] = Array.isArray(body.chars)
    ? [...new Set(
        (body.chars as unknown[])
          .filter((c): c is string => typeof c === 'string')
          .map(c => c.toLowerCase())
          .filter(c => /^[a-z]$/.test(c))
      )].slice(0, 26)
    : LETTERS

  if (chars.length === 0) {
    return new Response(JSON.stringify({ ok: false, error: 'No valid chars provided' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // ── 1. UFC Stats 스크래핑 ─────────────────────────────────────────
  const scrapeResults = await pMap(chars, scrapeLetter, CONCURRENCY)

  const ufcStatsMap = new Map<string, FighterData>()
  const failedLetters: string[] = []

  scrapeResults.forEach((result, i) => {
    if (!result.ok) failedLetters.push(chars[i])
    for (const [name, data] of result.map) {
      ufcStatsMap.set(name, data)
    }
  })

  // 스크래핑이 전혀 안 됐으면 조기 종료
  if (ufcStatsMap.size === 0 && failedLetters.length === chars.length) {
    return new Response(
      JSON.stringify({ ok: false, error: 'All scrape requests failed', failedLetters }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // ── 2. DB에서 대상 파이터 가져오기 ──────────────────────────────
  const { data: rows, error: fetchErr, count } = await admin
    .from('fighters')
    .select('id, name_en', { count: 'exact' })
    .is('height_cm', null)
    .not('name_en', 'is', null)

  if (fetchErr) {
    return new Response(
      JSON.stringify({ ok: false, error: 'DB fetch failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const fighters = rows ?? []

  // ── 3. 이름 매칭 + 업데이트 ─────────────────────────────────────
  let updated = 0, skipped = 0, failed = 0

  for (const fighter of fighters) {
    const key  = normalizeName(fighter.name_en ?? '')
    const data = ufcStatsMap.get(key)

    if (!data || (data.heightCm === null && data.reachCm === null)) {
      skipped++
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

    const { error: upErr } = await admin.from('fighters').update(updatePayload).eq('id', fighter.id)
    if (upErr) failed++
    else updated++
  }

  // 응답: 개수만, 내부 이름/ID 노출 없음
  return new Response(
    JSON.stringify({
      ok:           true,
      scraped:      ufcStatsMap.size,
      total:        count ?? 0,
      updated,
      skipped,
      failed,
      failedLetters: failedLetters.length > 0 ? failedLetters : undefined,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
