-- ================================================================
-- Security 방어심층 — 기존 public 테이블 불필요 권한 정리
--
-- 1) 전 public base table 에서 anon/authenticated 의 REFERENCES/TRIGGER/TRUNCATE 회수.
--    근거(이전 감사): 이 3권한은 PostgREST 로 도달 불가(REF/TRIGGER 는 DDL·CREATE 필요,
--    anon/auth 는 schema public CREATE 없음; TRUNCATE 는 REST 미노출). 정상 앱/RPC 의존 없음.
--    service_role/postgres 권한은 유지(회수 대상 아님).
--
-- 2) RLS 가 쓰기를 전면 차단하는 5개 테이블의 미사용 INSERT/UPDATE/DELETE grant 회수:
--    news, battle_votes, seasons, season_hof, user_rank_snapshots.
--    근거: 모두 RLS on + write 정책 0개(또는 정책 0개) → 직접 쓰기 RLS 차단 상태.
--    정상 쓰기 주체는 정의자 RPC(owner=postgres) 또는 service_role:
--      seasons              → admin_end_season / admin_update_season_name
--      season_hof           → admin_hide_hof_entry / admin_restore_hof_entry
--      user_rank_snapshots  → capture_leaderboard_snapshot (service_role)
--      battle_votes         → vote_battle (정의자)
--      news                 → 직접 writer 없음(dormant)
--    ∴ anon/authenticated DML grant 회수해도 정상 경로 영향 없음(정의자/service_role 유지).
--    SELECT 권한은 변경하지 않음.
--
-- 멱등성: REVOKE 만 사용(재적용 안전). 신규 grant 생성 없음.
-- 비변경: 데이터/RLS 정책/RPC 본문, SELECT 권한, 정상 쓰기 테이블의 INSERT/UPDATE/DELETE,
--         service_role/postgres 권한, frontend/Edge Function.
-- ================================================================

-- ── 1) 전 public base table: REFERENCES/TRIGGER/TRUNCATE 회수 ────────────────
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'   -- 일반 base table 만
    ORDER BY c.relname
  LOOP
    EXECUTE format(
      'REVOKE REFERENCES, TRIGGER, TRUNCATE ON public.%I FROM anon, authenticated',
      r.relname
    );
  END LOOP;
END $$;

-- ── 2) RLS-deny 5개 테이블: 미사용 직접 DML 회수(SELECT 유지) ────────────────
REVOKE INSERT, UPDATE, DELETE ON public.news                FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.battle_votes        FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.seasons             FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.season_hof          FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.user_rank_snapshots FROM anon, authenticated;
