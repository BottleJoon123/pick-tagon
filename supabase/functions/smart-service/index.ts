import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

Deno.serve(async (req) => {
if (req.method === 'OPTIONS') {
  return new Response(null, { status: 204, headers: corsHeaders })
}

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  const geminiKey = Deno.env.get('GEMINI_API_KEY') ?? ''

  // ✅ 7일 캐시 체크
  const { data: cached } = await supabase.from('ufc_data_cache').select('updated_at').eq('type', 'rankings').single()
  if (cached) {
    const daysSince = (Date.now() - new Date(cached.updated_at).getTime()) / 1000 / 60 / 60 / 24
    if (daysSince < 7) {
      return new Response(JSON.stringify({ success: true, cached: true, days_since: daysSince.toFixed(1) }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
  }

  // ① thesportsdb에서 UFC 예정 이벤트 가져오기
  let upcomingEvents: any[] = []
  try {
    const evRes = await fetch('https://www.thesportsdb.com/api/v1/json/3/eventsnextleague.php?id=4443')
    const evData = await evRes.json()
    upcomingEvents = (evData.events || []).slice(0, 5).map((e: any) => ({
      id: e.idEvent,
      name: e.strEvent,
      date: e.dateEvent,
      venue: e.strVenue,
      country: e.strCountry,
    }))
  } catch {}

  // ② Gemini로 최신 UFC 랭킹 가져오기
  let rankings: any = null
  if (geminiKey) {
    const prompt = `현재 최신 UFC 공식 랭킹을 아래 JSON 형식으로 반환해줘. 다른 설명 없이 JSON만.
{
  "p4p_male": [{"rank":1,"name":"","nation":"","record":"","division":""},...10명],
  "p4p_female": [{"rank":1,"name":"","nation":"","record":"","division":""},...5명],
  "lightweight": {"champion":{"name":"","nation":"","record":""},"top5":[{"rank":1,"name":"","nation":"","record":""},...5명]},
  "middleweight": {"champion":{"name":"","nation":"","record":""},"top5":[...]},
  "welterweight": {"champion":{"name":"","nation":"","record":""},"top5":[...]},
  "heavyweight": {"champion":{"name":"","nation":"","record":""},"top5":[...]},
  "featherweight": {"champion":{"name":"","nation":"","record":""},"top5":[...]},
  "bantamweight": {"champion":{"name":"","nation":"","record":""},"top5":[...]},
  "women_strawweight": {"champion":{"name":"","nation":"","record":""},"top5":[...]},
  "women_flyweight": {"champion":{"name":"","nation":"","record":""},"top5":[...]}
}`
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.1 } }) }
      )
      if (res.ok) {
        const data = await res.json()
        const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
        const clean = raw.replace(/```json/gi, '').replace(/```/g, '').trim()
        const start = clean.indexOf('{'), end = clean.lastIndexOf('}')
        if (start >= 0 && end >= 0) rankings = JSON.parse(clean.slice(start, end + 1))
      }
    } catch {}
  }

  // DB에 저장
  const payload = { rankings, upcoming_events: upcomingEvents, updated_at: new Date().toISOString() }
  await supabase.from('ufc_data_cache').upsert({ type: 'rankings', data: payload, updated_at: new Date().toISOString() })

  return new Response(JSON.stringify({ success: true, cached: false, events: upcomingEvents.length, rankings: !!rankings }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
