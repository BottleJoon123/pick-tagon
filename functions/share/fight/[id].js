// GET /share/fight/:id — dynamic OG for a matchup share link (Stage 1).
// og:image stays static (/og-pickt-v3.png); title/description/url are dynamic.
// Read-only Supabase REST SELECT. Falls back to a safe home OG (never 500).
import { restSelectOne, ogHtml, htmlResponse, divisionLabel, segmentLabel, SITE_URL } from '../../_utils/og.js';

function homeFallback() {
  return htmlResponse(ogHtml({
    title: 'PICK-TAGON',
    description: 'UFC 예측과 파이터 데이터를 확인하세요',
    appUrl: SITE_URL + '/',
    canonical: SITE_URL + '/'
  }));
}

export async function onRequest(context) {
  try {
    const id = (context && context.params && context.params.id) ? String(context.params.id) : '';
    const row = await restSelectOne(
      context.env, 'matchups',
      'id,red_fighter_name,blue_fighter_name,red_fighter_id,blue_fighter_id,weight_class,card_segment,is_main_event,result_status', id
    );
    if (!row) return homeFallback();

    const red = row.red_fighter_name || 'RED';
    const blue = row.blue_fighter_name || 'BLUE';
    const title = red + ' vs ' + blue + ' | PICK-TAGON';

    const wc = divisionLabel(row.weight_class);
    const seg = segmentLabel(row.card_segment, row.is_main_event);
    const description = [wc, seg, '승부 예측하기'].filter(Boolean).join(' · ');

    return htmlResponse(ogHtml({
      title: title,
      description: description,
      appUrl: SITE_URL + '/?fight=' + encodeURIComponent(id) + '&og=v2',
      canonical: SITE_URL + '/share/fight/' + encodeURIComponent(id)
    }));
  } catch (e) {
    return homeFallback();
  }
}
