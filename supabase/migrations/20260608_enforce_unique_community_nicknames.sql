-- ================================================================
-- 닉네임 대소문자/공백 정규화 unique 강제 + 읽기전용 가용성 체크 RPC
--
-- 전제(read-only 감사): lower(btrim(nickname)) 기준 중복 0건, null/empty 0건,
--   공백 이슈 0건. 기존 users_nickname_key UNIQUE(nickname)(exact) 위에
--   대소문자/공백 무시 unique 를 추가한다.
-- 길이(2~16)는 기존 1글자 닉네임 1명 grandfather 때문에 DB CHECK 미적용 → 프론트 검증.
-- RLS(users_select_own, 본인 행만)로 클라가 타 유저 닉을 못 읽으므로,
--   가입/변경 전 사전 중복 체크용 읽기전용 SECURITY DEFINER 함수를 제공(boolean만 반환).
-- 멱등: IF NOT EXISTS / CREATE OR REPLACE / REVOKE+GRANT 재적용 안전.
-- ================================================================

-- (A) 대소문자 + 앞뒤공백 무시 부분 unique index (비어있지 않은 닉만)
CREATE UNIQUE INDEX IF NOT EXISTS users_nickname_ci_unique
  ON public.users (lower(btrim(nickname)))
  WHERE nickname IS NOT NULL AND btrim(nickname) <> '';

-- (B) 닉네임 가용성 체크(읽기전용). 정규화(lower+btrim) 기준, 본인(exclude) 제외.
--     boolean 만 반환 → 사용자 식별자 비노출. anon/authenticated 사전체크용.
CREATE OR REPLACE FUNCTION public.nickname_available(p_nick text, p_exclude uuid DEFAULT NULL)
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE
    WHEN btrim(coalesce(p_nick, '')) = '' THEN false
    ELSE NOT EXISTS (
      SELECT 1 FROM public.users u
      WHERE lower(btrim(u.nickname)) = lower(btrim(p_nick))
        AND (p_exclude IS NULL OR u.id <> p_exclude)
    )
  END;
$function$;

REVOKE EXECUTE ON FUNCTION public.nickname_available(text, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.nickname_available(text, uuid) TO anon, authenticated;
