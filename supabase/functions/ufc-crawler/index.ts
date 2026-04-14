import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import * as cheerio from 'https://esm.sh/cheerio@1.0.0-rc.12'

// ── CORS ──────────────────────────────────────────────────────────
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

// ── 타겟 URL ──────────────────────────────────────────────────────
const SHERDOG_URL = 'https://www.sherdog.com/events/upcoming'
const SHERDOG_BASE = 'https://www.sherdog.com'

// ── CSS 선택자 (교체 필요시 여기만 수정) ─────────────────────────
const SEL_CONTAINER   = '.right-tabs-content.event-tab-ufc'
const SEL_LINK        = 'a'
const SEL_DATE_DIVS   = '.calendar-date > div'
const SEL_TITLE_BOLD  = '.event > b'
const SEL_EVENT_TEXT  = '.event'

// ── 타입 정의 ─────────────────────────────────────────────────────
interface UFCEvent {
  title: string
  event_date: string
  source_url: string
}

// ── 월 매핑 ───────────────────────────────────────────────────────
const MONTH_MAP: Record<string, string> = {
  Jan:'01', Feb:'02', Mar:'03', Apr:'04', May:'05', Jun:'06',
  Jul:'07', Aug:'08', Sep:'09', Oct:'10', Nov:'11', Dec:'12',
}

const normalize = (v: string) => v.replace(/\s+/g, ' ').trim()

// ── 파싱 함수 (Codex 작성 + 통합) ────────────────────────────────
function parseSherdogUFCEvents(html: string): UFCEvent[] {
  try {
    const $ = cheerio.load(html)
    const container = $(SEL_CONTAINER).first()

    if (!container.length) {
      console.warn('[ufc-crawler] UFC container not found — selector may need update:', SEL_CONTAINER)
      return []
    }

    const events: UFCEvent[] = []

    container.children(SEL_LINK).each((_, el) => {
      const link = $(el)
      const href = link.attr('href')
      if (!href) return

      const dateParts = link
        .find(SEL_DATE_DIVS)
        .map((_i, div) => normalize($(div).text()))
        .get()

      if (dateParts.length !== 3) return

      const [monthText, dayText, yearText] = dateParts
      const month = MONTH_MAP[monthText]
      const day   = String(parseInt(dayText, 10)).padStart(2, '0')
      const year  = String(parseInt(yearText, 10))

      if (!month || !/^\d{2}$/.test(day) || !/^\d{4}$/.test(year)) return

      const boldText      = normalize(link.find(SEL_TITLE_BOLD).first().text())
      const fullEventText = normalize(link.find(SEL_EVENT_TEXT).first().text())

      if (!boldText || !fullEventText.startsWith(boldText)) return

      const subtitle = normalize(fullEventText.slice(boldText.length))
      const title    = subtitle ? `${boldText} - ${subtitle}` : boldText

      events.push({
        title,
        event_date: `${year}-${month}-${day}`,
        source_url: `${SHERDOG_BASE}${href}`,
      })
    })

    return events
  } catch (e) {
    console.error('[ufc-crawler] Parse error:', e)
    return []
  }
}

// ── Edge Function 메인 ────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // service_role 키로 RLS 우회
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  const errors: string[] = []

  // 1. Sherdog 페이지 fetch
  let html = ''
  try {
    const res = await fetch(SHERDOG_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,*/*;q=0.9',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    html = await res.text()
  } catch (e: any) {
    return new Response(
      JSON.stringify({ success: false, error: `Fetch failed: ${e.message}` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }

  // 2. HTML 파싱
  const events = parseSherdogUFCEvents(html)
  if (events.length === 0) {
    return new Response(
      JSON.stringify({ success: false, error: 'No events parsed — CSS selectors may need update', html_length: html.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 422 }
    )
  }

  // 3. pending_events upsert (중복 기준: title)
  const rows = events.map(e => ({
    title:      e.title,
    event_date: e.event_date,
    source_url: e.source_url,
    status:     'pending',
  }))

  const { error: upsertError, count } = await supabase
    .from('pending_events')
    .upsert(rows, { onConflict: 'title', ignoreDuplicates: true })
    .select('id', { count: 'exact', head: true })

  if (upsertError) {
    errors.push(`DB upsert failed: ${upsertError.message}`)
  }

  return new Response(
    JSON.stringify({
      success:    errors.length === 0,
      parsed:     events.length,
      upserted:   count ?? 0,
      events,
      errors,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
