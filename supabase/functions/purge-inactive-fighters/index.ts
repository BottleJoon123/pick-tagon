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
    signal: AbortSignal.timeout(15000),
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

  // Admin check — only admins may trigger a destructive purge
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

  // Scrape all pages in parallel batches of 4
  // Abort immediately on ANY scrape error — partial data must never trigger delete
  const allSlugs = new Set<string>()
  let page = 0
  const MAX_PAGES = 60

  while (page < MAX_PAGES) {
    const batchPages = [page, page + 1, page + 2, page + 3]
    const results = await Promise.allSettled(batchPages.map(p => scrapePageSlugs(p)))

    // Any failure → abort entirely
    for (let i = 0; i < results.length; i++) {
      if (results[i].status === 'rejected') {
        const err = (results[i] as PromiseRejectedResult).reason?.message
        return new Response(
          JSON.stringify({
            success: false,
            error: `Scrape error on page ${batchPages[i]}: ${err}. Purge aborted — no data was deleted.`,
            collected: allSlugs.size,
          }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Collect slugs from this batch
    let batchTotal = 0
    for (const r of results) {
      const slugs = (r as PromiseFulfilledResult<string[]>).value
      batchTotal += slugs.length
      for (const s of slugs) allSlugs.add(s)
    }

    // End of pagination: entire batch returned no fighters
    if (batchTotal === 0) break

    page += 4
  }

  const activeIds = Array.from(allSlugs)

  if (activeIds.length < 700) {
    return new Response(
      JSON.stringify({
        success: false,
        error: `Aborted: only ${activeIds.length} active slugs collected — expected ≥700. Scrape may be incomplete.`,
        collected: activeIds.length,
      }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  if (dryRun) {
    // Use RPC for safe server-side count
    const { data: wouldDelete, error: dryErr } = await supabase.rpc('purge_inactive_fighters_dry_run', {
      active_ids: activeIds,
    })
    return new Response(
      JSON.stringify({
        success: true,
        dryRun: true,
        collected: activeIds.length,
        wouldDelete: dryErr ? null : (wouldDelete ?? 0),
        error: dryErr?.message,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  // Execute purge via RPC (has its own ≥700 guardrail)
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
