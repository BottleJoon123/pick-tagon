import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // height/reach가 비어있고 height_cm/reach_cm이 있는 파이터 모두 가져오기
  const { data: rows, error: fetchErr } = await admin
    .from('fighters')
    .select('id, height_cm, reach_cm')
    .or('height_cm.not.is.null,reach_cm.not.is.null')

  if (fetchErr) {
    return new Response(
      JSON.stringify({ ok: false, error: fetchErr.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  let heightUpdated = 0
  let reachUpdated = 0
  const errors: string[] = []

  for (const row of rows ?? []) {
    const updates: Record<string, string> = {}
    if (row.height_cm != null) { updates.height = `${Math.round(row.height_cm)} cm`; heightUpdated++ }
    if (row.reach_cm  != null) { updates.reach  = `${Math.round(row.reach_cm)} cm`;  reachUpdated++  }

    if (Object.keys(updates).length > 0) {
      const { error: upErr } = await admin.from('fighters').update(updates).eq('id', row.id)
      if (upErr) errors.push(`${row.id}: ${upErr.message}`)
    }
  }

  return new Response(
    JSON.stringify({ ok: true, heightUpdated, reachUpdated, errors }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
