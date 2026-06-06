-- ================================================================
-- Security P2 — event_picks 직접 쓰기 차단 (place_pick/change_pick 단일 경로화)
--
-- 배경:
--   event_picks 는 anon/authenticated 에게 직접 INSERT/UPDATE/DELETE 가 self 정책으로 열려 있어
--   사용자가 RPC 우회로 자기 event_picks 행을 직접 조작 가능(스코어 컬럼은 없으나 단일경로 위반).
--
-- 감사 결과(정상 경로):
--   • 픽 비율 RPC get_event_pick_ratios 는 "picks" 테이블 기반 집계(event_picks 미사용).
--   • event_picks 동기화는 place_pick / change_pick(둘 다 SECURITY DEFINER, owner=postgres)이
--     ON CONFLICT (user_id, fight_id) DO UPDATE 로 수행 → 생성/변경/중복방지 완결.
--   • 프론트의 직접 쓰기 함수 saveEventPick() 은 어디서도 호출되지 않는 dead code(직접 upsert 제거 대상).
--   • event_picks 직접 SELECT 는 loadMyEventPicks(본인 막대 하이라이트) + Realtime 구독(라이브 비율 새로고침)
--     이 사용 → 공개 SELECT 는 유지해야 함(Realtime postgres_changes 는 구독 역할의 SELECT 권한 필요).
--   ∴ 쓰기만 차단하고 SELECT 는 유지하면 정상 픽 UX·커뮤니티 비율에 영향 없음.
--
-- 조치:
--   • anon/authenticated 의 직접 INSERT/UPDATE/DELETE/TRUNCATE 권한 회수.
--   • self 쓰기 RLS 정책 3개 제거(저장/수정/삭제).
--   • 공개 SELECT 정책 "누구나 픽 통계 조회 가능" + SELECT 권한 유지(Realtime/본인 조회).
--   • service_role / postgres / 정의자 RPC(place_pick/change_pick) 권한 유지 → 본문 미수정.
--
-- 비변경: place_pick/change_pick 본문, picks/users/points/정산 로직, 기존 event_picks 데이터,
--         get_event_pick_ratios, leaderboard/community 기타 로직.
-- ================================================================

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.event_picks FROM anon, authenticated;

DROP POLICY IF EXISTS "본인 픽 저장" ON public.event_picks;
DROP POLICY IF EXISTS "본인 픽 수정" ON public.event_picks;
DROP POLICY IF EXISTS "본인 픽 삭제" ON public.event_picks;
-- 유지: "누구나 픽 통계 조회 가능"(SELECT, USING true) + anon/authenticated SELECT grant.
