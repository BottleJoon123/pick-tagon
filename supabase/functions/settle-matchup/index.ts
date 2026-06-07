import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCorsPreflight(req)
  const corsHeaders = buildCorsHeaders(req)

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders })
  }

  // ── 어드민 인증 ─────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) {
    return Response.json({ error: 'missing_token' }, { status: 401, headers: corsHeaders })
  }

  const anonClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  )

  const { data: { user }, error: authErr } = await anonClient.auth.getUser()
  if (authErr || !user) {
    return Response.json({ error: 'unauthorized' }, { status: 401, headers: corsHeaders })
  }

  const { data: profile, error: profileErr } = await anonClient
    .from('users')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (profileErr || !profile?.is_admin) {
    return Response.json({ error: 'forbidden' }, { status: 403, headers: corsHeaders })
  }

  // ── 입력 검증 ───────────────────────────────────────────────────────
  let body: {
    matchupId:  string
    winnerName: string
    winnerSide: 'red' | 'blue' | 'draw' | 'nc'
    method:     string
    round:      number
    time?:      string
    force?:     boolean
  }

  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400, headers: corsHeaders })
  }

  const { matchupId, winnerName, winnerSide, method, round } = body

  if (!matchupId || !winnerName || !winnerSide || !method || !round) {
    return Response.json({ error: 'missing_fields' }, { status: 400, headers: corsHeaders })
  }

  if (!['red', 'blue', 'draw', 'nc'].includes(winnerSide)) {
    return Response.json({ error: 'invalid_winner_side' }, { status: 400, headers: corsHeaders })
  }

  // matchupId가 UUID 형식인지 간단 검증
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRe.test(matchupId)) {
    return Response.json({ error: 'invalid_matchup_id' }, { status: 400, headers: corsHeaders })
  }

  // ── admin_set_matchup_result RPC 호출 (JWT 컨텍스트 유지) ──────────
  // anonClient에 사용자 JWT가 붙어 있으므로 RPC 내부의 auth.uid() /
  // private.is_admin() 이 정상 동작한다. service role client를 쓰면
  // auth.uid() = NULL → admin_required 예외 발생.
  const { data, error } = await anonClient.rpc('admin_set_matchup_result', {
    p_matchup_id:  matchupId,
    p_winner_name: winnerName,
    p_winner_side: winnerSide,
    p_method:      method,
    p_round:       round,
    p_time:        body.time ?? null,
    p_force:       body.force ?? false,
  })

  if (error) {
    console.error('[settle-matchup] admin_set_matchup_result error:', error)
    return Response.json({ error: error.message }, { status: 500, headers: corsHeaders })
  }

  return Response.json(data, { headers: corsHeaders })
})
