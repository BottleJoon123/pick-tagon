import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import * as cheerio from 'https://esm.sh/cheerio@1.0.0-rc.12'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

async function scrapePageSlugs(page: number): Promise<string[]> {
  const url = `https://kr.ufc.com/athletes/all?filters%5B0%5D=status%3A23&page=${page}`
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(20000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const html = await res.text()
  const $ = cheerio.load(html)
  const slugs: string[] = []

  $('.c-listing-athlete-flipcard.white').each((_, card) => {
    const href = $(card).find('a[href^="/athlete/"]').first().attr('href') || ''
    const slug = href.replace('/athlete/', '').trim()
    if (slug) slugs.push(slug)
  })

  return slugs
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

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

  // Admin check
  const { data: userRow } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', user.id)
    .single()
  if (!userRow?.is_admin) {
    return new Response(JSON.stringify({ error: 'Admin only' }), { status: 403, headers: corsHeaders })
  }

  const body = await req.json().catch(() => ({}))
  const dryRun: boolean = body.dryRun === true
  // strict=true → abort on any scrape error (for actual delete)
  // strict=false → tolerate page failures, proceed if ≥700 collected (for dry run)
  const strict: boolean = !dryRun

  const allSlugs = new Set<string>()
  const scrapeErrors: string[] = []
  const MAX_PAGES = 60
  let consecutiveEmpty = 0

  for (let page = 0; page < MAX_PAGES; page++) {
    let slugs: string[] = []
    try {
      slugs = await scrapePageSlugs(page)
    } catch (e: any) {
      const errMsg = `page ${page}: ${e.message}`
      if (strict) {
        return new Response(
          JSON.stringify({
            success: false,
            error: `Scrape failed (${errMsg}). Purge aborted — no data deleted.`,
            collected: allSlugs.size,
          }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      scrapeErrors.push(errMsg)
      await new Promise(r => setTimeout(r, 500))
      continue
    }

    if (slugs.length === 0) {
      consecutiveEmpty++
      if (consecutiveEmpty >= 2) break // two consecutive empty pages = end of list
    } else {
      consecutiveEmpty = 0
      for (const s of slugs) allSlugs.add(s)
    }

    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 300))
  }

  const activeIds = Array.from(allSlugs)

  if (activeIds.length < 600) {
    return new Response(
      JSON.stringify({
        success: false,
        error: `Aborted: only ${activeIds.length} active slugs collected — expected ≥700. ${scrapeErrors.length ? 'Scrape errors: ' + scrapeErrors.slice(0,3).join(', ') : 'Site may be blocking requests.'}`,
        collected: activeIds.length,
        scrapeErrors,
      }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  if (dryRun) {
    const { data: wouldDelete, error: dryErr } = await supabase.rpc('purge_inactive_fighters_dry_run', {
      active_ids: activeIds,
    })
    return new Response(
      JSON.stringify({
        success: true,
        dryRun: true,
        collected: activeIds.length,
        wouldDelete: dryErr ? null : (wouldDelete ?? 0),
        scrapeErrors,
        error: dryErr?.message,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Actual delete — RPC has its own ≥700 guardrail
  const { data: deleted, error: rpcErr } = await supabase.rpc('purge_inactive_fighters', {
    active_ids: activeIds,
  })

  if (rpcErr) {
    return new Response(
      JSON.stringify({ success: false, error: rpcErr.message, collected: activeIds.length }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  return new Response(
    JSON.stringify({ success: true, collected: activeIds.length, deleted: deleted ?? 0 }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
