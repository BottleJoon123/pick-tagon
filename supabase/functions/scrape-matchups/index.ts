import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import * as cheerio from 'https://esm.sh/cheerio@1.0.0-rc.12'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const jsonHeaders = {
  ...corsHeaders,
  'Content-Type': 'application/json',
}

const INVALID_NAMES = new Set(['TBA', 'TBD'])
const ALLOWED_HOSTS = new Set(['www.sherdog.com', 'sherdog.com'])

interface ScrapeMatchupsRequest {
  event_id: string
  source_url: string
}

interface FighterPair {
  red_fighter_name: string
  blue_fighter_name: string
}

interface MatchupInsertRow extends FighterPair {
  event_id: string
  is_main_event: boolean
  left_bias: number
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: jsonHeaders,
  })
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function isValidFighterName(value: string): boolean {
  const normalized = normalizeText(value)
  return normalized.length > 0 && !INVALID_NAMES.has(normalized.toUpperCase())
}

function buildPair(leftName: string, rightName: string): FighterPair | null {
  const red_fighter_name = normalizeText(leftName)
  const blue_fighter_name = normalizeText(rightName)

  if (!isValidFighterName(red_fighter_name) || !isValidFighterName(blue_fighter_name)) {
    return null
  }

  return {
    red_fighter_name,
    blue_fighter_name,
  }
}

function pairKey(pair: FighterPair): string {
  return `${pair.red_fighter_name.toLowerCase()}::${pair.blue_fighter_name.toLowerCase()}`
}

function extractMainEventPair($: cheerio.CheerioAPI): FighterPair | null {
  return buildPair(
    $('#main_event .fighter.left_side [itemprop="name"]').first().text(),
    $('#main_event .fighter.right_side [itemprop="name"]').first().text(),
  )
}

function extractCardPairs($: cheerio.CheerioAPI): FighterPair[] {
  const pairs: FighterPair[] = []

  $('.event_match_card, .sub-event').each((_index, element) => {
    const row = $(element)
    const pair = buildPair(
      row.find('.left_side [itemprop="name"]').first().text(),
      row.find('.right_side [itemprop="name"]').first().text(),
    )

    if (pair) {
      pairs.push(pair)
    }
  })

  return pairs
}

function extractFallbackPairs($: cheerio.CheerioAPI): FighterPair[] {
  // 시도 1: itemprop="athlete" 하위 itemprop="name" (Sherdog 레거시)
  let nodes = $('[itemprop="athlete"] [itemprop="name"]')
  // 시도 2: itemprop="name" 단독 (athlete 조상 없이)
  if (nodes.length === 0) nodes = $('[itemprop="name"]')
  // 시도 3: Sherdog 파이터 프로필 링크 텍스트 (구조 변경에 가장 강건)
  if (nodes.length === 0) nodes = $('a[href*="/fighter/"]')

  const names = nodes
    .map((_index, element) => normalizeText($(element).text()))
    .get()
    .filter(isValidFighterName)

  const pairs: FighterPair[] = []
  for (let index = 0; index + 1 < names.length; index += 2) {
    const pair = buildPair(names[index], names[index + 1])
    if (pair) pairs.push(pair)
  }
  return pairs
}

function parseMatchups(html: string): FighterPair[] {
  const $ = cheerio.load(html)
  const parsed: FighterPair[] = []
  const seen = new Set<string>()

  const pushPair = (pair: FighterPair, isMainEvent = false) => {
    const key = pairKey(pair)
    if (seen.has(key)) {
      return
    }

    seen.add(key)
    if (isMainEvent) {
      parsed.unshift(pair)
      return
    }

    parsed.push(pair)
  }

  const mainEventPair = extractMainEventPair($)
  const fullCardPairs = extractCardPairs($)
  const fallbackPairs = fullCardPairs.length > 0 ? [] : extractFallbackPairs($)
  const orderedCardPairs = fullCardPairs.length > 0 ? fullCardPairs : fallbackPairs

  if (mainEventPair) {
    pushPair(mainEventPair, true)
  } else if (orderedCardPairs.length > 0) {
    pushPair(orderedCardPairs[0], true)
  }

  for (const pair of orderedCardPairs) {
    pushPair(pair)
  }

  return parsed
}

async function fetchSourceHtml(sourceUrl: string): Promise<string> {
  const response = await fetch(sourceUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      Referer: 'https://www.google.com/',
    },
    signal: AbortSignal.timeout(12000),
  })

  if (!response.ok) {
    throw new Error(`Source fetch failed with HTTP ${response.status}`)
  }

  return await response.text()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Method not allowed' }, 405)
  }

  try {
    let payload: Partial<ScrapeMatchupsRequest>

    try {
      payload = await req.json()
    } catch {
      return jsonResponse({ success: false, error: 'Invalid JSON body' }, 400)
    }

    const event_id = typeof payload.event_id === 'string' ? payload.event_id.trim() : ''
    const source_url = typeof payload.source_url === 'string' ? payload.source_url.trim() : ''

    if (!event_id || !source_url) {
      return jsonResponse(
        { success: false, error: 'Missing required fields: event_id and source_url' },
        400,
      )
    }

    try {
      const parsedUrl = new URL(source_url)
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return jsonResponse({ success: false, error: 'source_url must be http or https' }, 400)
      }
      if (!ALLOWED_HOSTS.has(parsedUrl.hostname)) {
        return jsonResponse({ success: false, error: 'source_url hostname is not allowed' }, 400)
      }
    } catch {
      return jsonResponse({ success: false, error: 'source_url must be a valid URL' }, 400)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse(
        { success: false, error: 'Supabase environment variables are not configured' },
        500,
      )
    }

    const authorization = req.headers.get('Authorization') ?? ''

    if (!authorization.startsWith('Bearer ')) {
      return jsonResponse({ success: false, error: 'Unauthorized' }, 401)
    }

    const authSupabase = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: authData, error: authError } = await authSupabase.auth.getUser()

    if (authError || !authData.user) {
      return jsonResponse({ success: false, error: 'Unauthorized' }, 401)
    }

    // 로그인 확인만으로는 부족 — service_role delete/insert 전에 admin 검증
    const { data: adminRow } = await authSupabase
      .from('users')
      .select('is_admin')
      .eq('id', authData.user.id)
      .single()

    if (!adminRow?.is_admin) {
      return jsonResponse({ success: false, error: 'Admin only' }, 403)
    }

    const html = await fetchSourceHtml(source_url)
    const parsedPairs = parseMatchups(html)

    if (parsedPairs.length === 0) {
      return jsonResponse(
        {
          success: false,
          event_id,
          inserted: 0,
          matchups: [],
          error: 'No valid matchups found on source page',
        },
        422,
      )
    }

    const rows: MatchupInsertRow[] = parsedPairs.map((pair, index) => ({
      event_id,
      red_fighter_name: pair.red_fighter_name,
      blue_fighter_name: pair.blue_fighter_name,
      is_main_event: index === 0,
      left_bias: 0.5,
    }))

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })

    const { error: deleteError } = await supabase.from('matchups').delete().eq('event_id', event_id)

    if (deleteError) {
      throw new Error(`Failed to delete existing matchups: ${deleteError.message}`)
    }

    const { data: insertedRows, error: insertError } = await supabase
      .from('matchups')
      .insert(rows)
      .select(
        'id, event_id, red_fighter_name, blue_fighter_name, is_main_event, left_bias',
      )

    if (insertError) {
      throw new Error(`Failed to insert matchups: ${insertError.message}`)
    }

    return jsonResponse({
      success: true,
      event_id,
      inserted: insertedRows?.length ?? 0,
      matchups: insertedRows ?? [],
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error'
    console.error('[scrape-matchups]', error)

    return jsonResponse(
      {
        success: false,
        error: message,
      },
      500,
    )
  }
})
