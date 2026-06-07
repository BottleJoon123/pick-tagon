// [보안 CORS-2B] 서버/cron 전용 Edge Function CORS 정책 헬퍼.
//   - 브라우저 정상 호출 경로가 없는 함수용(fetch-mma-news, smart-service).
//   - 어떤 Origin 에도 Access-Control-Allow-Origin 을 제공하지 않는다 → 브라우저는 응답을 읽지 못함.
//   - Origin 없는 cron(net.http_post)·CLI·server-to-server 요청은 CORS 와 무관하게 기존 흐름대로 동작.
//     (CORS 헤더는 브라우저 전용 메커니즘이므로 simple GET/POST 실행 자체는 막지 못한다 —
//      실제 보안 경계는 함수 내부 인증/캐시 게이트다.)
//   - Vary: Origin 으로 Origin 별 캐시 안전성 유지.
//   - allowMethods 는 함수별 실제 사용 method(cron POST + preflight OPTIONS).
//
// 주의: 이 헬퍼는 _shared/cors.ts(관리자 브라우저 allowlist)와 의미가 다르다.
//       서버 전용 함수에만 사용하고, CORS-1/CORS-2A 함수에는 적용하지 않는다.

export function serverCorsHeaders(allowMethods = 'POST, OPTIONS'): Record<string, string> {
  return {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': allowMethods,
    'Vary': 'Origin',
  }
}

// 서버 전용 CORS preflight(OPTIONS) 응답 — 204, ACAO 없음.
export function handleServerCorsPreflight(allowMethods = 'POST, OPTIONS'): Response {
  return new Response(null, { status: 204, headers: serverCorsHeaders(allowMethods) })
}
