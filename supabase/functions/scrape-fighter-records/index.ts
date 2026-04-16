import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import * as cheerio from 'https://esm.sh/cheerio@1.0.0-rc.12'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

const UFCSTATS_BASE = 'http://www.ufcstats.com'

// ── 파이터 이름 정규화 (공백·마침표 제거 후 소문자 비교용)
const normName = (s: string) => (s || '').replace(/[.\-']/g, '').replace(/\s+/g, ' ').trim().toLowerCase()

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

  // UFCStats table: First | Last | Nickname | Ht | Wt | Reach | Stance | W | L | D | Belt
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
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // Admin-only: validate JWT
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

  const body = await req.json().catch(() => ({}))
  const letter: string = (body.letter || 'a').toLowerCase().slice(0, 1)

  // Fetch all fighters from DB for matching
  const { data: dbFighters, error: dbErr } = await supabase
    .from('fighters')
    .select('id, name, name_en, wins, losses, draws, height, reach')

  if (dbErr) {
    return new Response(JSON.stringify({ error: dbErr.message }), { status: 500, headers: corsHeaders })
  }

  // Build lookup: normName → db fighter id
  const dbMap = new Map<string, { id: string }>()
  for (const f of (dbFighters || [])) {
    if (f.name_en) dbMap.set(normName(f.name_en), { id: f.id })
    if (f.name && f.name !== f.name_en) dbMap.set(normName(f.name), { id: f.id })
  }

  let scraped: ScrapedFighter[] = []
  try {
    scraped = await scrapeLetter(letter)
  } catch (e: any) {
    return new Response(
      JSON.stringify({ success: false, error: `Scrape failed: ${e.message}`, letter }),
      { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  let updated = 0
  let skipped = 0
  const updates: { id: string; wins: number; losses: number; draws: number; height?: string; reach?: string }[] = []

  for (const sf of scraped) {
    const match = dbMap.get(normName(sf.name))
    if (!match) { skipped++; continue }

    updates.push({
      id: match.id,
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
    JSON.stringify({ success: true, letter, scraped: scraped.length, updated, skipped }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
