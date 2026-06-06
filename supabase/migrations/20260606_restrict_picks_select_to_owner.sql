-- ================================================================
-- Security 후속 — picks raw SELECT 본인 한정 전환
--
-- 배경:
--   기존 정책 "픽 전체 공개 읽기"(SELECT, roles=PUBLIC, USING true) 로 anon 포함 누구나
--   전 사용자의 개별 raw picks(user_id, pick_name/predicted_side, bet_cost/odds/payout,
--   lock 전 pending 전략 등)를 직접 조회 가능 → 전략/행동 데이터 전면 노출.
--
-- 감사 결과(정상 경로):
--   • 라이브 프론트의 picks 직접 SELECT 2곳 모두 .eq('user_id', currentUser.id) 본인 한정
--     (public/js/api/supabase.js: loadUserPicksFromDB, reconcileHistoryFromDB).
--   • 커뮤니티 비율/리더보드/프로필 통계는 전부 정의자(owner=postgres, SECURITY DEFINER)
--     집계 RPC 경유(get_event_pick_ratios/_summary, get_event_leaderboard, get_leaderboard_v2,
--     get_user_pick_stats) → RLS/grant 우회로 동작, 공개 SELECT 차단과 무관.
--   • 정산/place_pick/change_pick 도 정의자(postgres)/service_role → 무관.
--   ∴ 공개 raw SELECT 를 본인 한정으로 좁혀도 라이브 기능 회귀 없음.
--
-- 조치(동일 트랜잭션):
--   1) authenticated 본인 조회 정책 picks_select_own (auth.uid() = user_id) 추가.
--   2) 공개 읽기 정책 "픽 전체 공개 읽기" 제거.
--   3) anon SELECT 테이블 권한 회수(집계 RPC 는 정의자라 영향 없음).
--   4) authenticated SELECT 권한 유지(self 정책 동작에 필요), service_role 유지.
--
-- 비변경: picks 데이터, picks 쓰기 권한/정책(현재 차단 유지), 집계 RPC 본문,
--         users/points/settlement/event_picks, 프론트 코드.
-- ================================================================

-- 1) 본인 조회 정책(멱등)
DROP POLICY IF EXISTS picks_select_own ON public.picks;
CREATE POLICY picks_select_own ON public.picks
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- 2) 공개 읽기 정책 제거
DROP POLICY IF EXISTS "픽 전체 공개 읽기" ON public.picks;

-- 3) anon raw SELECT 차단(집계 RPC EXECUTE 에는 영향 없음 — 정의자 경유)
REVOKE SELECT ON public.picks FROM anon;

-- 4) authenticated SELECT 권한 유지(picks_select_own 동작에 필요), service_role 권한 불변.
--    picks 직접 INSERT/UPDATE/DELETE 는 기존대로 권한/정책 모두 부재 → 계속 차단.
