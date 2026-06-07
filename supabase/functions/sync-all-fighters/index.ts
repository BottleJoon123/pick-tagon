import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import * as cheerio from 'https://esm.sh/cheerio@1.0.0-rc.12'
import { buildCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts'

// ── Division 영문 → 코드 매핑 ─────────────────────────────────────
const DIV_MAP: Record<string, string> = {
  'Heavyweight': 'hw',
  'Light Heavyweight': 'lhw',
  'Middleweight': 'mw',
  'Welterweight': 'ww',
  'Lightweight': 'lw',
  'Featherweight': 'fw',
  'Bantamweight': 'bw',
  'Flyweight': 'flw',
  "Women's Strawweight": 'wmw',
  "Women's Flyweight": 'wfw',
  "Women's Bantamweight": 'wbw',
  "Women's Featherweight": 'wfe',
}

interface ScrapedFighter {
  id: string          // slug e.g. "islam-makhachev"
  name_en: string
  division: string | null
  wins: number
  losses: number
  draws: number
  image_url: string | null
}

const normalize = (s: string) => s.replace(/\s+/g, ' ').trim()
const slugify   = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

async function scrapePage(page: number): Promise<ScrapedFighter[]> {
  const url = `https://kr.ufc.com/athletes/all?filters%5B0%5D=status%3A23&page=${page}`
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'ko-KR,ko;q=0.9',
    },
    signal: AbortSignal.timeout(20000),
  })
  if (!res.ok) throw new Error(`kr.ufc.com page ${page}: HTTP ${res.status}`)

  const html = await res.text()
  const $ = cheerio.load(html)
  const fighters: ScrapedFighter[] = []

  // Each flipcard: .c-listing-athlete-flipcard.white
  $('.c-listing-athlete-flipcard.white').each((_, card) => {
    const el = $(card)

    // ID from href="/athlete/slug"
    const href  = el.find('a[href^="/athlete/"]').first().attr('href') || ''
    const slug  = href.replace('/athlete/', '').trim()
    if (!slug) return

    // English name
    const name_en = normalize(el.find('.c-listing-athlete__name').first().text())
    if (!name_en) return

    // Division (English text inside .c-listing-athlete__title .field__item)
    const divText   = normalize(el.find('.c-listing-athlete__title .field__item').first().text())
    const division  = DIV_MAP[divText] || null

    // Record: "25-1-0 (W-L-D)"
    const recordRaw = normalize(el.find('.c-listing-athlete__record').first().text())
    const rMatch    = recordRaw.match(/(\d+)-(\d+)-(\d+)/)
    const wins      = rMatch ? parseInt(rMatch[1]) : 0
    const losses    = rMatch ? parseInt(rMatch[2]) : 0
    const draws     = rMatch ? parseInt(rMatch[3]) : 0

    // Image: prefer full-body standing, fallback to teaser
    let image_url: string | null = null
    const bodyImg = el.find('img.image-style-event-fight-card-upper-body-of-standing-athlete').first()
    const teaserImg = el.find('img.image-style-teaser').first()
    const imgSrc = bodyImg.attr('src') || teaserImg.attr('src') || ''
    if (imgSrc && !imgSrc.includes('no-profile-image')) {
      // UFC images may be relative; ensure absolute
      image_url = imgSrc.startsWith('http') ? imgSrc : `https://ufc.com${imgSrc}`
    }

    fighters.push({ id: slug, name_en, division, wins, losses, draws, image_url })
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

  // Auth check
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
  const startPage: number = typeof body.startPage === 'number' ? body.startPage : 0
  const batchSize: number = Math.min(typeof body.batchSize === 'number' ? body.batchSize : 10, 20)


  // Load existing fighters for name dedup (name_en → id)
  const { data: existing, error: fetchErr } = await supabase
    .from('fighters')
    .select('id, name_en')

  if (fetchErr) {
    return new Response(JSON.stringify({ error: fetchErr.message }), { status: 500, headers: corsHeaders })
  }

  const existingMap = new Map<string, string>() // name_en.lower → id
  for (const f of (existing || [])) {
    if (f.name_en) existingMap.set(f.name_en.toLowerCase(), f.id)
  }

  const errors: string[] = []
  let totalScraped = 0
  let totalInserted = 0
  let totalUpdated = 0
  let hasMore = false

  // Fetch pages startPage … startPage+batchSize-1
  for (let page = startPage; page < startPage + batchSize; page++) {
    let fighters: ScrapedFighter[] = []
    try {
      fighters = await scrapePage(page)
    } catch (e: any) {
      errors.push(`page ${page}: ${e.message}`)
      continue
    }

    if (fighters.length === 0) {
      // No more pages
      hasMore = false
      break
    }

    totalScraped += fighters.length
    if (page === startPage + batchSize - 1 && fighters.length > 0) {
      hasMore = true // possibly more pages after this batch
    }

    // Build upsert rows
    const toInsert: object[] = []
    const toUpdate: object[] = []

    for (const f of fighters) {
      const existingId = existingMap.get(f.name_en.toLowerCase())

      if (existingId) {
        // Update existing fighter (wins, losses, draws, division, image_url)
        toUpdate.push({
          id: existingId,
          wins: f.wins,
          losses: f.losses,
          draws: f.draws,
          ...(f.division ? { division: f.division } : {}),
          ...(f.image_url ? { image_url: f.image_url } : {}),
          updated_at: new Date().toISOString(),
        })
      } else {
        // Insert new fighter
        toInsert.push({
          id: f.id,
          name: f.name_en,         // name defaults to English until admin sets Korean
          name_en: f.name_en,
          division: f.division,
          wins: f.wins,
          losses: f.losses,
          draws: f.draws,
          rank: null,
          image_url: f.image_url,
          updated_at: new Date().toISOString(),
        })
        // Add to existingMap to avoid duplicate inserts within same batch
        existingMap.set(f.name_en.toLowerCase(), f.id)
      }
    }

    // Batch upsert updates
    if (toUpdate.length > 0) {
      for (let i = 0; i < toUpdate.length; i += 50) {
        const chunk = toUpdate.slice(i, i + 50)
        const { error: updErr } = await supabase.from('fighters').upsert(chunk, { onConflict: 'id' })
        if (updErr) errors.push(`update chunk error: ${updErr.message}`)
        else totalUpdated += chunk.length
      }
    }

    // Batch insert new fighters
    if (toInsert.length > 0) {
      for (let i = 0; i < toInsert.length; i += 50) {
        const chunk = toInsert.slice(i, i + 50)
        const { error: insErr } = await supabase.from('fighters').upsert(chunk, { onConflict: 'id', ignoreDuplicates: false })
        if (insErr) errors.push(`insert chunk error: ${insErr.message}`)
        else totalInserted += chunk.length
      }
    }

    // Small delay between pages to avoid rate limiting
    if (page < startPage + batchSize - 1) {
      await new Promise(r => setTimeout(r, 200))
    }
  }

  return new Response(
    JSON.stringify({
      success: errors.length === 0,
      startPage,
      batchSize,
      totalScraped,
      totalInserted,
      totalUpdated,
      hasMore,
      errors: errors.slice(0, 5),
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
