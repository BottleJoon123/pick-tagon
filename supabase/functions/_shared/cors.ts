// [보안 CORS-1] 브라우저 관리자 Edge Function 용 Origin allowlist 헬퍼.
//   - 허용 production origin 만 Access-Control-Allow-Origin 으로 반사(와일드카드 '*' 제거).
//   - Origin 없는 요청(CLI/server-to-server)은 ACAO 없이 그대로 정상 처리 — 함수 내부 인증이 최종 방어.
//   - 허용되지 않은 Origin 은 ACAO 미포함 → 브라우저가 응답을 읽지 못함(인증/업무 로직 자체는 영향 없음).
//   - Vary: Origin 으로 Origin 별 응답 캐시 안전성 확보.
//   - Allow-Methods 는 invoke(POST) + preflight(OPTIONS) 로 최소화.

const ALLOWED_ORIGINS = new Set<string>([
  'https://pick-tagon.com',
])

// 요청 Origin 을 검사해 CORS 응답 헤더를 구성한다.
// 허용 Origin 일 때만 ACAO 를 해당 Origin 으로 반사한다.
export function buildCorsHeaders(req: Request): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
  const origin = req.headers.get('Origin')
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
  }
  return headers
}

// CORS preflight(OPTIONS) 응답. 허용 Origin 이면 ACAO 포함, 아니면 미포함.
export function handleCorsPreflight(req: Request): Response {
  return new Response(null, { status: 204, headers: buildCorsHeaders(req) })
}
