-- ================================================================
-- Security 2차 P0 — users 권한 필드 직접 수정 차단
--
-- 문제: authenticated/anon 가 PostgREST 로 자기 users 행의 points/total_picks/
--       success_picks/is_admin 을 직접 PATCH 가능 → 리더보드/랭크/벨트 위조.
--       (기존 트리거는 is_admin 만 보호, points 등은 무방비)
--
-- 방어(두 겹):
--   A. 컬럼 권한 최소화 — anon/authenticated 의 users 직접 UPDATE 를 nickname,
--      faction_id 로만 제한. points/total_picks/success_picks/is_admin/id/created_at
--      직접 UPDATE 권한 회수.
--   B. 트리거 확장 — 클라이언트 역할(current_user IN ('authenticated','anon')) 의
--      INSERT 는 점수/관리자 필드를 안전 기본값으로 강제, UPDATE 는 해당 필드 변경 시 예외.
--
-- 정상 경로 영향 없음:
--   place_pick / service_settle_matchup / admin_settle_event / admin RPC 는
--   SECURITY DEFINER(owner=postgres) → 내부 UPDATE 의 current_user='postgres' →
--   트리거 게이트 통과 + 컬럼 REVOKE 무관(owner 권한). service_role 도 통과.
--   클라이언트 정상 경로: 닉네임 변경(update nickname), 집단 변경(update faction_id),
--   신규 가입(insert) 은 그대로 동작. (points 푸시 경로 syncUserToDB 는 호출처 없는 dead code)
--
-- 변경 대상: public.users 만. picks/news_cache/ufc_data_cache/정산로직/Edge Function 미변경.
-- 기존 유저 데이터 변경 없음(권한/트리거만 변경).
-- ================================================================

-- ── B. 트리거 함수 확장 ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION private.protect_users_privileged_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- 클라이언트 역할의 직접 쓰기만 제한. SECURITY DEFINER(owner=postgres)/service_role 통과.
  IF current_user IN ('authenticated', 'anon') THEN
    IF TG_OP = 'INSERT' THEN
      -- 신규 가입행은 항상 안전 기본값으로 강제(클라이언트가 보낸 점수/관리자 플래그 무시).
      NEW.points        := 1000;
      NEW.total_picks   := 0;
      NEW.success_picks := 0;
      NEW.is_admin      := false;
    ELSE  -- UPDATE
      IF COALESCE(OLD.is_admin, false) IS DISTINCT FROM COALESCE(NEW.is_admin, false) THEN
        RAISE EXCEPTION 'changing is_admin is not allowed';
      END IF;
      IF OLD.points IS DISTINCT FROM NEW.points THEN
        RAISE EXCEPTION 'changing points is not allowed';
      END IF;
      IF OLD.total_picks IS DISTINCT FROM NEW.total_picks THEN
        RAISE EXCEPTION 'changing total_picks is not allowed';
      END IF;
      IF OLD.success_picks IS DISTINCT FROM NEW.success_picks THEN
        RAISE EXCEPTION 'changing success_picks is not allowed';
      END IF;
      IF OLD.id IS DISTINCT FROM NEW.id THEN
        RAISE EXCEPTION 'changing id is not allowed';
      END IF;
      IF OLD.created_at IS DISTINCT FROM NEW.created_at THEN
        RAISE EXCEPTION 'changing created_at is not allowed';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ── A. 컬럼 권한 최소화 (defense-in-depth) ──────────────────────
-- 주의: authenticated/anon 는 users 에 "테이블 단위" UPDATE 권한을 갖고 있어
--       컬럼 단위 REVOKE 만으로는 무력화되지 않는다. 테이블 권한을 회수하고
--       유저가 실제로 바꿔야 하는 컬럼(nickname, faction_id)만 재부여한다.
REVOKE UPDATE ON public.users FROM anon, authenticated;
GRANT  UPDATE (nickname, faction_id) ON public.users TO authenticated;
-- anon 은 어떤 컬럼도 직접 UPDATE 불가(로그인 사용자만 프로필 수정; RLS 와 이중).
-- INSERT 권한은 유지 → 신규 가입 정상; 트리거가 점수/관리자 필드를 안전값으로 강제.
