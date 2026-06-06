-- ================================================================
-- Security 2차 P1 — picks 직접 쓰기 차단
--
-- 문제: authenticated/anon 가 PostgREST 로 자기 picks 행의 status/settled_payout/
--       payout/actual_winner/actual_method/is_upset 등을 직접 PATCH 가능
--       (`픽 업데이트 본인만` RLS: auth.uid()=user_id, 컬럼 제한 없음) →
--       정확도(get_leaderboard_v2 / get_user_pick_stats) 및 집단 net_points
--       (get_faction_member_rankings: SUM(settled_payout) WHERE status='win') 위조.
--
-- 감사 결과(정상 경로):
--   클라이언트는 picks 를 직접 INSERT/UPDATE/DELETE 하지 않는다(전부 SELECT 읽기뿐).
--   픽 생성=place_pick, 변경=change_pick, 정산=service_settle_matchup/admin_settle_event
--   — 모두 SECURITY DEFINER, owner=postgres → 클라이언트 권한/RLS 와 무관하게 동작.
--   따라서 클라이언트 직접 쓰기 권한을 제거해도 정상 기능에 영향 없음.
--
-- 조치:
--   1) anon/authenticated 의 picks 직접 INSERT/UPDATE/DELETE 권한 회수
--      (PostgREST 로 도달 가능한 쓰기. SELECT 는 유지 = 이번 범위 밖/P2 보류)
--   2) self-update RLS 정책 `픽 업데이트 본인만` 제거(정의자 RPC 만으로 충분)
--
-- 비변경: `픽 전체 공개 읽기`(SELECT) 정책, service_role 권한, 정산 RPC 본문,
--         users 권한, event_picks, news_cache/ufc_data_cache/_staging_bulk_import.
--   (TRUNCATE/REFERENCES/TRIGGER 권한은 PostgREST 로 도달 불가 — 별도 전수정리 대상.)
-- ================================================================

-- 1) 클라이언트 직접 쓰기 권한 회수(SELECT 유지, service_role 유지)
REVOKE INSERT, UPDATE, DELETE ON public.picks FROM anon, authenticated;

-- 2) self-update RLS 정책 제거 — 모든 픽 쓰기는 place_pick/change_pick/정산 RPC(정의자)로만
DROP POLICY IF EXISTS "픽 업데이트 본인만" ON public.picks;
