import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

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
    matchupId: string
    winnerName: string
    winnerSide: 'red' | 'blue'
    method: string
    round: number
    time?: string
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

  if (!['red', 'blue'].includes(winnerSide)) {
    return Response.json({ error: 'invalid_winner_side' }, { status: 400, headers: corsHeaders })
  }

  // matchupId가 UUID 형식인지 간단 검증
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRe.test(matchupId)) {
    return Response.json({ error: 'invalid_matchup_id' }, { status: 400, headers: corsHeaders })
  }

  // ── service_role로 SQL 함수 호출 ────────────────────────────────────
  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const { data, error } = await adminClient.rpc('service_settle_matchup', {
    p_matchup_id:  matchupId,
    p_winner_name: winnerName,
    p_winner_side: winnerSide,
    p_method:      method,
    p_round:       round,
    p_time:        body.time ?? null,
  })

  if (error) {
    console.error('[settle-matchup] rpc error:', error)
    return Response.json({ error: error.message }, { status: 500, headers: corsHeaders })
  }

  return Response.json(data, { headers: corsHeaders })
})
