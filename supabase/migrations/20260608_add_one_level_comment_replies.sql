-- ================================================================
-- 1단계 대댓글: post_comments.parent_comment_id (self-FK) + 깊이1 강제 트리거
--
-- A안: 직접 INSERT 유지 + 기존 BEFORE INSERT 트리거(post_comments_set_user_id) 확장.
-- RLS/GRANT/soft-delete RPC/기존 데이터 변경 없음. 멱등(IF NOT EXISTS / CREATE OR REPLACE).
-- ================================================================

-- (A) self-FK 컬럼 (NULL=최상위). 부모 물리삭제 시 자식 고아화 방지 위해 SET NULL.
ALTER TABLE public.post_comments
  ADD COLUMN IF NOT EXISTS parent_comment_id bigint REFERENCES public.post_comments(id) ON DELETE SET NULL;

-- (B) 답글 그룹핑/조회용 부분 인덱스
CREATE INDEX IF NOT EXISTS idx_post_comments_parent
  ON public.post_comments (parent_comment_id)
  WHERE parent_comment_id IS NOT NULL;

-- (C) 기존 신원 강제 트리거 함수 확장 (BEFORE INSERT). owner=postgres, search_path 고정 유지.
--     - 기존: auth.uid() 필수 + user_id/user_nick(users.nickname) 강제
--     - 추가: 신규 INSERT 의 deleted_at/deleted_by 항상 NULL 강제
--     - 추가: parent 검증(존재/동일 post/미삭제) + 깊이1 정규화(답글에 답글 → root)
CREATE OR REPLACE FUNCTION public.post_comments_set_user_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid         uuid := auth.uid();
  v_nick        text;
  v_parent_post bigint;
  v_parent_del  timestamptz;
  v_parent_par  bigint;
  v_root_id     bigint;
  v_root_post   bigint;
  v_root_del    timestamptz;
BEGIN
  -- 신원 강제 (기존 동작 유지)
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth_required';
  END IF;

  NEW.user_id := v_uid;

  SELECT NULLIF(btrim(u.nickname), '')
    INTO v_nick
  FROM public.users u
  WHERE u.id = v_uid;

  IF v_nick IS NULL THEN
    RAISE EXCEPTION 'nickname_required';
  END IF;

  NEW.user_nick := v_nick;

  -- 신규 INSERT 는 항상 미삭제 상태로 강제 (클라가 deleted_* 주입 못 하게)
  NEW.deleted_at := NULL;
  NEW.deleted_by := NULL;

  -- 대댓글(parent) 검증 + 깊이1 정규화
  IF NEW.parent_comment_id IS NOT NULL THEN
    SELECT pc.post_id, pc.deleted_at, pc.parent_comment_id
      INTO v_parent_post, v_parent_del, v_parent_par
    FROM public.post_comments pc
    WHERE pc.id = NEW.parent_comment_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'parent_not_found';
    END IF;
    IF v_parent_post IS DISTINCT FROM NEW.post_id THEN
      RAISE EXCEPTION 'parent_post_mismatch';
    END IF;
    IF v_parent_del IS NOT NULL THEN
      RAISE EXCEPTION 'parent_deleted';
    END IF;

    -- parent 가 이미 답글이면 그 root 로 정규화 (깊이 1 강제) + root 재검증
    IF v_parent_par IS NOT NULL THEN
      v_root_id := v_parent_par;

      SELECT pc.post_id, pc.deleted_at
        INTO v_root_post, v_root_del
      FROM public.post_comments pc
      WHERE pc.id = v_root_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'parent_not_found';
      END IF;
      IF v_root_post IS DISTINCT FROM NEW.post_id THEN
        RAISE EXCEPTION 'parent_post_mismatch';
      END IF;
      IF v_root_del IS NOT NULL THEN
        RAISE EXCEPTION 'parent_deleted';
      END IF;

      NEW.parent_comment_id := v_root_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
