import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import * as cheerio from 'https://esm.sh/cheerio@1.0.0-rc.12'
import { buildCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts'

const UFCSTATS_BASE = 'http://www.ufcstats.com'

interface ScrapedFighter {
  name: string
  wins: number
  losses: number
  draws: number
  height?: string
  reach?: string
}

async function scrapeLetter(letter: string): Promise<ScrapedFighter[]> {
  const url = `${UFCSTATS_BASE}/statistics/fighters?char=${letter}&page=all`
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) throw new Error(`UFCStats ${letter}: ${res.status}`)

  const html = await res.text()
  const $ = cheerio.load(html)
  const fighters: ScrapedFighter[] = []

  $('table.b-statistics__table tbody tr').each((_, row) => {
    const tds = $(row).find('td')
    if (tds.length < 10) return

    const first  = $(tds[0]).text().trim()
    const last   = $(tds[1]).text().trim()
    if (!first && !last) return

    const name   = [first, last].filter(Boolean).join(' ')
    const height = $(tds[3]).text().trim() || undefined
    const reach  = $(tds[5]).text().trim() || undefined
    const wins   = parseInt($(tds[7]).text().trim()) || 0
    const losses = parseInt($(tds[8]).text().trim()) || 0
    const draws  = parseInt($(tds[9]).text().trim()) || 0

    fighters.push({ name, wins, losses, draws, height, reach })
  })

  return fighters
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCorsPreflight(req)
  const corsHeaders = buildCorsHeaders(req)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Missing auth' }), { status: 401, headers: corsHeaders })
  }
  const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
  }
  // Admin check — service_role upsert는 admin만 (로그인만으로는 불가)
  const { data: userRow } = await supabase.from('users').select('is_admin').eq('id', user.id).single()
  if (!userRow?.is_admin) {
    return new Response(JSON.stringify({ error: 'Admin only' }), { status: 403, headers: corsHeaders })
  }

  const body = await req.json().catch(() => ({}))
  const letter: string = (body.letter || 'a').toLowerCase().slice(0, 1)

  let scraped: ScrapedFighter[] = []
  try {
    scraped = await scrapeLetter(letter)
  } catch (e: any) {
    return new Response(
      JSON.stringify({ success: false, error: `Scrape failed: ${e.message}`, letter }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  if (scraped.length === 0) {
    return new Response(
      JSON.stringify({ success: true, letter, scraped: 0, updated: 0, skipped: 0 }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // ── SQL-side matching: JS Map 대신 PostgreSQL regexp_replace로 매칭 ──
  // DB에서 모든 파이터 조회 + 정규화된 이름 포함
  const { data: dbFighters, error: dbErr } = await supabase
    .from('fighters')
    .select('id, name_en')
    .limit(5000)

  if (dbErr) {
    return new Response(JSON.stringify({ error: dbErr.message }), { status: 500, headers: corsHeaders })
  }

  // JS side normalize: explicit accent map + strip non-alnum
  const norm = (s: string) => s
    .toLowerCase()
    .replace(/[àáâãäå]/g, 'a').replace(/[èéêë]/g, 'e').replace(/[ìíîï]/g, 'i')
    .replace(/[òóôõö]/g, 'o').replace(/[ùúûü]/g, 'u').replace(/[ýÿ]/g, 'y')
    .replace(/[ñ]/g, 'n').replace(/[ç]/g, 'c').replace(/[žź]/g, 'z')
    .replace(/[šś]/g, 's').replace(/[čć]/g, 'c').replace(/[řŕ]/g, 'r')
    .replace(/[ðđ]/g, 'd').replace(/[ł]/g, 'l').replace(/[ğ]/g, 'g')
    .replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()

  // Build lookup Map
  const dbMap = new Map<string, string>() // normed_name → id
  const lastMap = new Map<string, { id: string; count: number }>()

  for (const f of (dbFighters ?? [])) {
    if (!f.name_en) continue
    const key = norm(f.name_en)
    dbMap.set(key, f.id)
    const lastName = key.split(' ').pop()!
    if (lastName.length > 2) {
      const ex = lastMap.get(lastName)
      if (!ex) lastMap.set(lastName, { id: f.id, count: 1 })
      else if (ex.id !== f.id) ex.count++ // only count distinct fighters
    }
  }

  let updated = 0
  let skipped = 0
  const updates: object[] = []

  for (const sf of scraped) {
    const sfNorm = norm(sf.name)
    let matchId = dbMap.get(sfNorm)

    if (!matchId) {
      // Fallback: last-name-only (unique last name only)
      const lastName = sfNorm.split(' ').pop()!
      const ln = lastMap.get(lastName)
      if (ln && ln.count === 1) matchId = ln.id
    }

    if (!matchId) { skipped++; continue }

    updates.push({
      id: matchId,
      wins: sf.wins,
      losses: sf.losses,
      draws: sf.draws,
      ...(sf.height && sf.height !== '--' ? { height: sf.height } : {}),
      ...(sf.reach  && sf.reach  !== '--' ? { reach:  sf.reach  } : {}),
    })
  }

  // Batch upsert in chunks of 50
  for (let i = 0; i < updates.length; i += 50) {
    const chunk = updates.slice(i, i + 50)
    const { error: upErr } = await supabase
      .from('fighters')
      .upsert(chunk, { onConflict: 'id' })
    if (upErr) {
      console.error('[scrape-fighter-records] upsert error:', upErr.message)
    } else {
      updated += chunk.length
    }
  }

  return new Response(
    JSON.stringify({
      success: true, letter,
      scraped: scraped.length, updated, skipped,
      dbLoaded: (dbFighters ?? []).length, // 디버그: DB에서 로드된 파이터 수
      sample: scraped.slice(0, 3).map(f => ({ name: f.name, normed: norm(f.name) })), // 첫 3개 샘플
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
