// GET /share/fighter/:id — dynamic OG for a fighter share link (Stage 1).
// og:image stays static (/og-pickt-v3.png); title/description/url are dynamic.
// Read-only Supabase REST SELECT. Falls back to a safe home OG (never 500).
import { restSelectOne, ogHtml, htmlResponse, divisionLabel, rankLabel, SITE_URL } from '../../_utils/og.js';

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
      context.env, 'fighters',
      'id,name,name_en,nickname,division,rank,wins,losses,draws', id
    );
    if (!row) return homeFallback();

    const name = row.name_en || row.name || '?';
    const nick = (row.nickname || '').trim();
    const title = name + (nick ? ' · ' + nick : '') + ' | PICK-TAGON';

    const record = (row.wins != null)
      ? ((row.wins || 0) + '-' + (row.losses || 0) + (row.draws ? '-' + row.draws : ''))
      : '';
    const divRank = [divisionLabel(row.division), rankLabel(row.rank)].filter(Boolean).join(' ');
    const description = [record, divRank, '파이터 프로필 보기'].filter(Boolean).join(' · ');

    return htmlResponse(ogHtml({
      title: title,
      description: description,
      appUrl: SITE_URL + '/?fighter=' + encodeURIComponent(id) + '&og=v2',
      canonical: SITE_URL + '/share/fighter/' + encodeURIComponent(id)
    }));
  } catch (e) {
    return homeFallback();
  }
}
