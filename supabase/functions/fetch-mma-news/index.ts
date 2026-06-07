import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

function classifyCategory(title: string): string {
  if (/KO|TKO|서브미션|판정|결과|승|패|우승|타이틀 방어|타이틀 획득/.test(title)) return 'result'
  if (/랭킹|순위|P4P|파운드 포 파운드/.test(title)) return 'ranking'
  if (/UFC [0-9]{3}|파이트 나이트|이벤트|대진표|카드|Fight Night/.test(title)) return 'event'
  if (/복귀|계약|방출|은퇴|이적|인터뷰|기자회견|선수|트레이닝|코치/.test(title)) return 'fighter'
  return 'ufc'
}

// Google News RSS description에서 실제 기사 URL 추출
function extractActualUrl(descriptionHtml: string): string {
  if (!descriptionHtml) return ''
  // Google News description에는 <a href="https://actual-article.com">...</a> 형태로 실제 URL 포함
  const matches = descriptionHtml.matchAll(/<a\s+href=["']([^"']+)["'][^>]*>/gi)
  for (const m of matches) {
    const url = m[1]
    if (!url) continue
    // Google 도메인은 건너뜀, 실제 기사 URL만 추출
    if (url.includes('google.com') || url.includes('google.co.kr')) continue
    if (url.startsWith('http')) return url
  }
  return ''
}

async function fetchOgImage(articleUrl: string): Promise<string> {
  if (!articleUrl || !articleUrl.startsWith('http')) return ''
  try {
    const res = await fetch(articleUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,*/*;q=0.9',
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8'
      },
      signal: AbortSignal.timeout(8000),
      redirect: 'follow'
    })
    if (!res.ok) return ''
    const html = await res.text()
    const og =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)?.[1] ||
      html.match(/<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i)?.[1] || ''
    if (!og || !og.startsWith('http')) return ''
    // Google 캐시 이미지(공통 플레이스홀더) 버림
    if (og.includes('googleusercontent.com') || og.includes('google.com/images')) return ''
    return og
  } catch {
    return ''
  }
}

function parseRssItems(xml: string, source: string): any[] {
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) || []
  const results: any[] = []
  for (const item of items.slice(0, 8)) {
    const title = (item.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)?.[1] || '')
      .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").trim()
    if (!title || title.length < 4) continue
    if (!/[가-힣]/.test(title)) continue

    // raw description HTML 보존 (실제 URL 추출용)
    const rawDescription = item.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/)?.[1] || ''
    const summary = rawDescription
      .replace(/<[^>]+>/g,'')
      .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;/g,' ')
      .trim().slice(0,200)

    // Google News RSS link 추출
    const googleNewsUrl = (
      item.match(/<link\/>[\s\n]*(https?:\/\/[^\s<]+)/)?.[1] ||
      item.match(/<link>([^<]+)<\/link>/)?.[1] ||
      item.match(/<guid[^>]*>([^<]+)<\/guid>/)?.[1] || ''
    ).trim()

    // description에서 실제 기사 URL 추출 (OG 이미지 fetch용)
    const actualUrl = extractActualUrl(rawDescription)

    const pubDate = item.match(/<pubDate>([^<]+)<\/pubDate>/)?.[1] || ''
    const srcName = (item.match(/<source[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/source>/)?.[1] || source)
      .replace(/&amp;/g,'&').trim()

    results.push({
      title,
      summary: summary || srcName,
      url: googleNewsUrl,          // 사용자 클릭용 (Google News)
      _fetch_url: actualUrl || '', // OG fetch용 (실제 기사 URL)
      image_url: '',
      source: srcName,
      category: classifyCategory(title),
      published_at: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString()
    })
  }
  return results
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  const url = new URL(req.url)
  const force = url.searchParams.get('force') === 'true'

  // [보안 P2] force=true(12h 캐시 우회)는 관리자 전용 — 무인증 강제 갱신 차단(fail-closed).
  //   경로 1: ADMIN_SECRET(env) 설정 + 요청 x-admin-secret 일치
  //   경로 2: 유효한 admin JWT(users.is_admin=true)
  //   force=false(일반/cron)는 기존 공개 경로 + 12h 캐시 가드 그대로 유지.
  if (force) {
    const adminSecret = Deno.env.get('ADMIN_SECRET')
    const secretOk = !!adminSecret && req.headers.get('x-admin-secret') === adminSecret
    if (!secretOk) {
      const authHeader = req.headers.get('Authorization')
      if (!authHeader) {
        return new Response(JSON.stringify({ success: false, error: 'Missing auth' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
      if (authErr || !user) {
        return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const { data: userRow } = await supabase.from('users').select('is_admin').eq('id', user.id).single()
      if (!userRow?.is_admin) {
        return new Response(JSON.stringify({ success: false, error: 'Admin only' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }
  }

  if (!force) {
    const { data: latest } = await supabase
      .from('news_cache')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1)
    if (latest && latest.length > 0) {
      const hoursSince = (Date.now() - new Date(latest[0].created_at).getTime()) / 3600000
      if (hoursSince < 12) {
        return new Response(
          JSON.stringify({ success: true, cached: true, hours_since: hoursSince.toFixed(2) }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }
  }

  const allItems: any[] = []
  const errors: string[] = []
  const queries = ['UFC', 'MMA 격투기', 'UFC 한국 선수', '종합격투기', 'UFC 결과']

  for (const q of queries) {
    const feedUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=ko&gl=KR&ceid=KR:ko`
    try {
      const res = await fetch(feedUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)', 'Accept': 'application/rss+xml, text/xml, */*' },
        signal: AbortSignal.timeout(8000)
      })
      if (!res.ok) { errors.push(`${q}: HTTP ${res.status}`); continue }
      const xml = await res.text()
      const items = parseRssItems(xml, '구글뉴스')
      for (const item of items) {
        if (!allItems.find(x => x.title === item.title)) allItems.push(item)
      }
    } catch (e: any) {
      errors.push(`${q}: ${e.message}`)
    }
  }

  // 실제 기사 URL로 OG 이미지 병렬 수집 (최대 20개)
  const targetItems = allItems.slice(0, 20)
  const fetchUrls = targetItems.map(item => item._fetch_url || item.url)
  const withActualUrl = fetchUrls.filter(u => u && !u.includes('google.com')).length

  const ogResults = await Promise.allSettled(
    fetchUrls.map(u => fetchOgImage(u))
  )
  targetItems.forEach((item, i) => {
    const r = ogResults[i]
    if (r.status === 'fulfilled' && r.value) item.image_url = r.value
  })

  // DB 저장 전 내부 필드 제거
  const dbItems = allItems.map(({ _fetch_url, ...rest }) => rest)

  if (dbItems.length > 0) {
    await supabase.from('news_cache').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    const { error: insertError } = await supabase.from('news_cache').insert(dbItems)
    if (insertError) {
      return new Response(
        JSON.stringify({ success: false, error: insertError.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }
  }

  const withImages = dbItems.filter(x => x.image_url).length
  return new Response(
    JSON.stringify({ success: true, cached: false, count: dbItems.length, with_images: withImages, actual_url_count: withActualUrl, errors }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
