-- ================================================================
-- 0P 회생 정책 — 일일 Recovery Points (잔액을 정확히 100P로 복구)
--
--   제품 정책(확정):
--     • 픽 비용은 서버 고정 100P (place_pick c_bet_cost := 100). 잔액 < 100 이면 픽 불가.
--     • 잔액 100P 미만인 로그인 사용자만 신청 가능.
--     • 추가 지급이 아니라 "현재 잔액을 정확히 100P로 복구" (0→100, 40→100, 99→100).
--     • 한국시간(Asia/Seoul) 기준 하루 1회. 자동 지급 없음 — 사용자가 버튼으로 명시 신청.
--     • 추천 보상은 조작 위험으로 이번 범위 제외.
--     • 클라이언트는 보안 경계 아님 — 본 RPC가 조건을 최종 강제.
--
--   감사 요지(2026-06-14, READ-ONLY):
--     • users.points = integer, NULL 허용, default 1000, CHECK 제약 없음.
--       라이브 10명 전원 ≥100 (min 300, max 3521), 음수·NULL·0 각 0명 → 현재 대상자 없음.
--     • 포인트를 바꾸는 모든 경로는 SECURITY DEFINER owner=postgres 함수뿐:
--       place_pick / service_settle_matchup / admin_settle_event / admin_end_season /
--       admin_delete_event. 클라이언트 직접 UPDATE 는 컬럼권한(REVOKE)+private 트리거로 차단
--       (authenticated 는 users 의 nickname/faction_id 만 UPDATE 가능).
--     • 기존 포인트 ledger/claim/reward 테이블 없음(admin_audit_logs 는 어드민 액션 로그) →
--       재사용 불가, 신규 ledger 1개 신설.
--     • 신규 테이블은 default-privileges 하드닝에도 anon/authenticated 에 SELECT 가 자동 부여됨 →
--       ledger 는 SELECT 까지 명시 REVOKE + RLS(정책 없음)로 클라이언트 직접 접근 전면 차단.
--     • 신규 함수는 전역 PUBLIC EXECUTE 가 잔존 → 명시 REVOKE FROM PUBLIC,anon 필수(운영 규칙).
--
--   동시성/원자성:
--     • RPC 가 users 행을 FOR UPDATE 로 잠가 동시 요청·정산과 직렬화.
--     • 같은 KST 날짜 1회는 ledger PK(user_id, claim_date) UNIQUE 로 강제(이중 백스톱).
--     • ledger INSERT → users UPDATE 를 한 트랜잭션(함수)으로 수행 → 실패 시 둘 다 롤백.
--
--   범위: 신규 테이블 1 + 신규 함수 1. 기존 테이블/함수/RLS/정산·시즌 로직/데이터 불변.
-- ================================================================

-- ── A. 지급 이력(ledger) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.point_recovery_claims (
    user_id        uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    claim_date     date        NOT NULL,
    points_before  integer     NOT NULL,
    points_granted integer     NOT NULL,
    points_after   integer     NOT NULL,
    created_at     timestamptz NOT NULL DEFAULT now(),
    -- 사용자별 하루 1회를 DB 차원에서 보장(동시요청 백스톱).
    CONSTRAINT point_recovery_claims_pkey PRIMARY KEY (user_id, claim_date)
);

-- RLS on + 클라이언트 정책 없음 → 직접 SELECT/INSERT/UPDATE/DELETE 0건 가능.
ALTER TABLE public.point_recovery_claims ENABLE ROW LEVEL SECURITY;

-- default-privileges 가 신규 테이블에 SELECT 를 anon/authenticated 로 자동 부여하므로
-- 최소권한 원칙으로 전부 회수(원장은 RPC 반환값으로만 노출; 타 사용자 신청 패턴 비공개).
REVOKE ALL ON TABLE public.point_recovery_claims FROM PUBLIC, anon, authenticated;
-- service_role 은 운영/디버깅용으로 유지(rolbypassrls=true; 명시 GRANT 로 의도 고정).
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.point_recovery_claims TO service_role;

-- ── B. 신청 RPC ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.claim_daily_recovery_points()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    c_target  CONSTANT integer := 100;            -- 복구 목표 잔액(= 픽 비용)
    v_user    uuid    := auth.uid();
    v_today   date    := (now() AT TIME ZONE 'Asia/Seoul')::date;  -- KST 기준 일자
    v_next    timestamptz;                          -- 다음 KST 자정(UTC instant)
    v_points  integer;
    v_grant   integer;
    v_after   integer;
BEGIN
    -- 다음 KST 자정을 instant 로(이미 신청/안내 표시용). 트랜잭션 내 일관.
    v_next := ((v_today + 1)::timestamp AT TIME ZONE 'Asia/Seoul');

    -- 1) 로그인 필수 (JWT 의 sub; 클라이언트가 위조 불가)
    IF v_user IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'auth_required');
    END IF;

    -- 2) users 행 직렬화 잠금 (동시 요청·정산과 순서 보장)
    SELECT points INTO v_points
      FROM public.users
     WHERE id = v_user
     FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'user_not_found');
    END IF;

    -- 3) 비정상 잔액(NULL/음수)은 복구하지 않고 안전 중단 (포인트/ledger 불변).
    --    음수를 100 으로 올리면 100 초과 지급이 되어 손상을 은폐 → 명시적으로 거부.
    IF v_points IS NULL OR v_points < 0 THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'invalid_balance_state');
    END IF;

    -- 4) 이미 100P 이상이면 대상 아님 (변경 0).
    IF v_points >= c_target THEN
        RETURN jsonb_build_object(
            'ok', false, 'reason', 'not_eligible',
            'points_before', v_points, 'points_after', v_points
        );
    END IF;

    v_grant := c_target - v_points;   -- 0..99 → 1..100 (99P 신청은 +1만)
    v_after := c_target;              -- 정확히 100

    -- 5) 같은 KST 날짜 1회 — 먼저 ledger 에 INSERT 해 PK 로 race 차단.
    --    동시 두 요청 중 하나만 INSERT 성공, 나머지는 unique_violation → already_claimed.
    BEGIN
        INSERT INTO public.point_recovery_claims
            (user_id, claim_date, points_before, points_granted, points_after)
        VALUES (v_user, v_today, v_points, v_grant, v_after);
    EXCEPTION WHEN unique_violation THEN
        RETURN jsonb_build_object(
            'ok', false, 'reason', 'already_claimed', 'next_eligible_at', v_next
        );
    END;

    -- 6) 잔액을 정확히 100 으로 (owner=postgres → users 컬럼권한/트리거 통과).
    --    동일 트랜잭션이므로 이후 오류 시 ledger INSERT 까지 함께 롤백.
    UPDATE public.users SET points = v_after WHERE id = v_user;

    RETURN jsonb_build_object(
        'ok', true, 'reason', 'ok',
        'points_before',   v_points,
        'points_granted',  v_grant,
        'points_after',    v_after,
        'next_eligible_at', v_next
    );
END;
$$;

ALTER FUNCTION public.claim_daily_recovery_points() OWNER TO postgres;

-- 권한: 전역 PUBLIC EXECUTE 잔존 차단 + anon 차단, authenticated 만 호출.
REVOKE ALL ON FUNCTION public.claim_daily_recovery_points() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_daily_recovery_points() TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_daily_recovery_points() TO service_role;
