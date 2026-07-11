// ================================================================
// refresh-youtube-cache — 서버 전용 YouTube 수집 → public.youtube_cache upsert
//
// 목적: 프론트가 r.jina.ai 로 직접 스크래핑(403/CAPTCHA 다발)하던 것을 서버로 이전.
//   서버에서만 YouTube Data API v3(search.list)로 영상 메타를 가져와 youtube_cache 에 idempotent upsert.
//   프론트는 youtube_cache 를 SELECT 만 한다(가짜 영상 생성 없음).
//
// 보안/안전 설계:
//   • 서버/cron 전용 — 브라우저에 ACAO 미제공(아래 serverCorsHeaders, _shared/cors-server.ts 와 동일).
//   • REFRESH_SECRET(env) + 요청 x-refresh-secret 일치해야 실행(fail-closed).
//     - REFRESH_SECRET 미설정 → 503(누구도 실행 불가). anon 임의 refresh 차단.
//   • YOUTUBE_API_KEY(env) 미설정 → 503 config_required. 외부 호출/더미 데이터 절대 없음(우선순위 C).
//   • API key 는 서버 env 로만 읽고 응답/로그에 노출하지 않음.
//   • 네트워크/쿼터 실패, 결과 0건 → 해당 query skip. upsert 로만 갱신 → 기존 캐시 stale 유지(파괴 없음).
//   • 응답에는 수집 개수/ query별 upsert 개수/ error summary 만 포함(키·PII 없음).
//
// 배포: deploy 시 verify_jwt=false (내부 REFRESH_SECRET 게이트가 실 방어). cron 은 net.http_post 로 6h 주기.
//
// 우선순위:  A. YouTube Data API v3 search.list ← 구현 / B. 채널 RSS(키워드 검색 불가) → V1 제외 / C. 실패 반환
// ================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// 서버 전용 CORS(브라우저 정상 호출 경로 없음 — ACAO 미제공). _shared/cors-server.ts 와 동일 의미.
function serverCorsHeaders(allowMethods = 'POST, OPTIONS'): Record<string, string> {
  return {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-refresh-secret',
    'Access-Control-Allow-Methods': allowMethods,
    'Vary': 'Origin',
  }
}

// 프론트 public/js/data/constants.js 의 YOUTUBE_CARDS[].query 와 동일해야 함(수동 동기화).
//   프론트가 query 문자열로 캐시를 조회하므로 정확히 일치해야 카드가 렌더된다.
const QUERIES: string[] = [
  'UFC 하이라이트',
  'UFC 분석 리뷰',
  'MMA 격투기 뉴스',
  'UFC 선수 인터뷰 기자회견',
  'UFC 경기 프리뷰 예측',
  '한국 MMA 격투기 선수',
]

const MAX_PER_QUERY = 6

// YouTube API 는 title/channel 을 HTML 엔티티(&quot; &amp; &#39; 등)로 반환한다.
// 프론트 renderYoutubeVideoCard 가 escapeHtml() 로 다시 이스케이프하므로, 저장 전 1회 디코드해
// 깨끗한 텍스트로 보관한다(그렇지 않으면 카드에 &quot; 가 그대로 노출). &amp; 는 마지막에 처리.
function decodeEntities(s: string): string {
  if (!s) return s
  return s
    .replace(/&quot;/g, '"').replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'").replace(/&#039;/g, "'").replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&amp;/g, '&')
}

Deno.serve(async (req) => {
  const corsHeaders = serverCorsHeaders()
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  // 1) refresh secret 게이트 (fail-closed) — 무인증/anon refresh 차단
  const refreshSecret = Deno.env.get('REFRESH_SECRET')
  if (!refreshSecret) return json({ ok: false, error: 'refresh_secret_not_configured' }, 503)
  if (req.headers.get('x-refresh-secret') !== refreshSecret) return json({ ok: false, error: 'unauthorized' }, 401)

  // 2) YouTube API key 게이트 — 없으면 외부 호출 없이 즉시 설정필요 반환(가짜 데이터 금지)
  const apiKey = Deno.env.get('YOUTUBE_API_KEY')
  if (!apiKey) return json({ ok: false, error: 'youtube_api_key_not_configured', hint: 'set YOUTUBE_API_KEY secret' }, 503)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  const perQuery: Array<{ query: string; upserted: number }> = []
  const errors: string[] = []
  let totalUpserted = 0

  for (const q of QUERIES) {
    try {
      const apiUrl = 'https://www.googleapis.com/youtube/v3/search'
        + '?part=snippet&type=video&safeSearch=none'
        + `&maxResults=${MAX_PER_QUERY}&order=date&relevanceLanguage=ko`
        + `&q=${encodeURIComponent(q)}&key=${apiKey}`

      const res = await fetch(apiUrl, { signal: AbortSignal.timeout(8000) })
      if (!res.ok) {
        // 쿼터/네트워크 실패 → skip. 기존 캐시 파괴 없음(stale 유지).
        errors.push(`${q}: HTTP ${res.status}`)
        continue
      }
      const data = await res.json()

      // 실제 API 결과만 매핑(videoId 있는 항목). title 은 NOT NULL → 빈 값이면 안전한 기본값.
      const seen = new Set<string>()
      const rows = (Array.isArray(data.items) ? data.items : [])
        .map((it: any) => it?.id?.videoId ? {
          query: q,
          video_id: String(it.id.videoId),
          title: (it?.snippet?.title && decodeEntities(String(it.snippet.title)).trim()) || '(제목 없음)',
          channel_title: it?.snippet?.channelTitle ? decodeEntities(String(it.snippet.channelTitle)) : null,
          thumbnail_url: it?.snippet?.thumbnails?.medium?.url
            || it?.snippet?.thumbnails?.default?.url || null,
          published_at: it?.snippet?.publishedAt ? String(it.snippet.publishedAt) : null,
          source: 'youtube',
          fetched_at: new Date().toISOString(),
        } : null)
        .filter((r: any) => r && !seen.has(r.video_id) && seen.add(r.video_id))

      if (rows.length === 0) {
        // 결과 0건 → 기존 캐시를 지우지 않음(빈 화면 대신 stale/fallback 유지)
        perQuery.push({ query: q, upserted: 0 })
        continue
      }

      // idempotent upsert — (query, video_id) 충돌 시 최신 메타로 갱신. 중복 누적 없음.
      const { error } = await supabase
        .from('youtube_cache')
        .upsert(rows, { onConflict: 'query,video_id' })
      if (error) {
        // upsert 실패 → 기존 캐시 그대로(stale 유지)
        errors.push(`${q}: ${error.message}`)
        continue
      }

      // (선택·미구현) prune: query별 오래된 video 정리는 후속 과제. V1 은 upsert-only(파괴 최소).

      perQuery.push({ query: q, upserted: rows.length })
      totalUpserted += rows.length
    } catch (e: any) {
      // 타임아웃/네트워크 예외 → skip, 기존 캐시 유지
      errors.push(`${q}: ${e?.message ?? 'error'}`)
    }
  }

  // 키·PII 없이 요약만 반환
  return json({ ok: true, total_upserted: totalUpserted, per_query: perQuery, errors })
})
