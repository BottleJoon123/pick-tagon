-- ================================================================
-- Security 2차 P1 — news_cache 관리자 쓰기 RPC 전환 + 직접 쓰기 차단
--
-- 배경:
--   news_cache 는 공개 읽기 + (오설정으로) anon/authenticated 직접 INSERT/DELETE 가 열려 있었다
--   (정책 "뉴스 서비스 계정만 삽입"(INSERT, roles=PUBLIC, check=true),
--    "뉴스 삭제 허용"(DELETE, roles=PUBLIC, using=true) → 사실상 누구나 뉴스 위조/삭제 가능).
--   정상 쓰기 주체:
--     ① Edge Function fetch-mma-news : createClient(..., SERVICE_ROLE_KEY) 로 delete+insert
--        (RSS 수집, source≠'admin'). service_role 은 rolbypassrls=true → 정책/권한과 무관하게 유지.
--     ② 관리자 뉴스 UI(public/js/news-admin.js) : authenticated 세션의 직접 upsert/delete
--        (source='admin'). ← 이 직접 경로를 RPC 로 대체하고 직접 쓰기 권한을 회수한다.
--
-- 조치:
--   1) admin_upsert_news / admin_delete_news : SECURITY DEFINER + auth.uid() + private.is_admin() 가드.
--      허용 컬럼만 명시 추출(mass assignment 차단), 필수 필드 검증, admin_audit_logs 기록.
--      url 기준 upsert / admin 행 단일 삭제로 기존 onConflict:'url' 동작 재현.
--   2) news_cache anon/authenticated 직접 INSERT/UPDATE/DELETE/TRUNCATE 권한 회수 +
--      공개 write 정책 2개 제거. 공개 SELECT 정책/권한, service_role 쓰기는 유지.
--
-- 비변경: users/picks/points/settlement/ufc_data_cache/_staging_bulk_import,
--         fetch-mma-news Edge Function, news_cache 공개 SELECT, service_role 권한, 기존 데이터.
--   (REFERENCES/TRIGGER 권한은 PostgREST 미도달 — 전역 권한 정리 시 일괄 처리 대상.)
-- ================================================================

-- ── 0) admin 뉴스 url 부분 유니크 인덱스 ─────────────────────────────────────
-- admin 행(source='admin')에 한해 url 유일성 보장 → 동시 호출 중복 INSERT 방지,
-- admin_upsert_news 의 ON CONFLICT arbiter 로 사용. fetch-mma-news 의 RSS 행
-- (source≠'admin', url 중복 다수 존재)은 부분 조건에서 제외되어 영향 없음.
CREATE UNIQUE INDEX IF NOT EXISTS news_cache_admin_url_uniq
  ON public.news_cache (url)
  WHERE source = 'admin';

-- ── RPC 1) admin_upsert_news(p_payload jsonb) ────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_upsert_news(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_title        text;
  v_summary      text;
  v_url          text;
  v_image_url    text;
  v_category     text;
  v_published_at timestamptz;
  v_existing     public.news_cache%ROWTYPE;
  v_row          public.news_cache%ROWTYPE;
  v_action       text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF NOT private.is_admin() THEN RAISE EXCEPTION 'admin_required'; END IF;

  -- 허용 컬럼만 명시 추출 (id/source/created_at 등 임의 컬럼은 무시 = mass assignment 차단)
  v_title        := NULLIF(btrim(p_payload->>'title'), '');
  v_summary      := p_payload->>'summary';
  v_url          := NULLIF(btrim(p_payload->>'url'), '');
  v_image_url    := NULLIF(p_payload->>'image_url', '');
  v_category     := COALESCE(NULLIF(btrim(p_payload->>'category'), ''), 'NEWS');
  v_published_at := COALESCE((p_payload->>'published_at')::timestamptz, now());

  -- 필수 필드 검증
  IF v_title IS NULL THEN RAISE EXCEPTION 'title_required'; END IF;
  IF v_url   IS NULL THEN RAISE EXCEPTION 'url_required';   END IF;

  -- audit before-snapshot (best-effort; admin 행만 대상, 공개 RSS 행은 무관)
  SELECT * INTO v_existing
  FROM public.news_cache
  WHERE url = v_url AND source = 'admin'
  ORDER BY id
  LIMIT 1;

  -- 원자적 upsert: 부분 유니크 인덱스 (url) WHERE source='admin' 를 arbiter 로 사용.
  -- 동시 신규 호출이 와도 두 번째는 DO UPDATE 로 병합 → 중복 INSERT 불가.
  -- source≠'admin'(fetch-mma-news RSS) 행은 인덱스 대상이 아니므로 충돌/영향 없음.
  INSERT INTO public.news_cache (title, summary, url, image_url, category, source, published_at)
  VALUES (v_title, v_summary, v_url, v_image_url, v_category, 'admin', v_published_at)
  ON CONFLICT (url) WHERE source = 'admin'
  DO UPDATE SET title = EXCLUDED.title, summary = EXCLUDED.summary, image_url = EXCLUDED.image_url,
                category = EXCLUDED.category, published_at = EXCLUDED.published_at
  RETURNING * INTO v_row;

  v_action := CASE WHEN v_existing.id IS NULL THEN 'inserted' ELSE 'updated' END;

  INSERT INTO public.admin_audit_logs
    (admin_user_id, action, entity_table, entity_id, before_data, after_data, metadata)
  VALUES (
    v_uid, 'upsert_news', 'news_cache', v_row.id::text,
    CASE WHEN v_action = 'updated' THEN to_jsonb(v_existing) ELSE NULL END,
    to_jsonb(v_row),
    jsonb_build_object('action', v_action)
  );

  RETURN jsonb_build_object(
    'ok', true, 'action', v_action,
    'id', v_row.id, 'title', v_row.title, 'url', v_row.url,
    'category', v_row.category, 'source', v_row.source,
    'published_at', v_row.published_at
  );
END;
$$;

-- ── RPC 2) admin_delete_news(p_url text) ─────────────────────────────────────
-- 식별자 타입 = text(url): 관리자 UI(news-admin.js)는 news_cache.id(bigint)를 보유하지 않고
-- url(link 또는 'picktagon-admin://'+localId)로 행을 식별하며, 이는 upsert 충돌 키와 동일하다.
CREATE OR REPLACE FUNCTION public.admin_delete_news(p_url text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_url text := NULLIF(btrim(p_url), '');
  v_row public.news_cache%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth_required'; END IF;
  IF NOT private.is_admin() THEN RAISE EXCEPTION 'admin_required'; END IF;
  IF v_url IS NULL THEN RAISE EXCEPTION 'url_required'; END IF;

  -- admin 행만, 정확히 한 행 선택(공개 RSS 행 삭제 불가)
  SELECT * INTO v_row
  FROM public.news_cache
  WHERE url = v_url AND source = 'admin'
  ORDER BY id
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found', 'url', v_url);
  END IF;

  DELETE FROM public.news_cache WHERE id = v_row.id;

  INSERT INTO public.admin_audit_logs
    (admin_user_id, action, entity_table, entity_id, before_data, after_data, metadata)
  VALUES (
    v_uid, 'delete_news', 'news_cache', v_row.id::text,
    to_jsonb(v_row), NULL, jsonb_build_object('url', v_url)
  );

  RETURN jsonb_build_object('ok', true, 'deleted_id', v_row.id, 'url', v_url);
END;
$$;

-- ── RPC 권한: PUBLIC/anon 회수, authenticated 허용(내부 is_admin() 최종 방어) ──
REVOKE ALL ON FUNCTION public.admin_upsert_news(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_upsert_news(jsonb) FROM anon;
GRANT  EXECUTE ON FUNCTION public.admin_upsert_news(jsonb) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.admin_upsert_news(jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.admin_delete_news(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_delete_news(text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.admin_delete_news(text) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.admin_delete_news(text) TO service_role;

-- ── news_cache 직접 쓰기 차단(공개 읽기 유지, service_role 유지) ──────────────
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.news_cache FROM anon, authenticated;

-- 오설정 공개 write 정책 제거(둘 다 roles=PUBLIC). 모든 뉴스 쓰기는 RPC(정의자) 또는 service_role 로만.
DROP POLICY IF EXISTS "뉴스 삭제 허용" ON public.news_cache;
DROP POLICY IF EXISTS "뉴스 서비스 계정만 삽입" ON public.news_cache;
-- 공개 SELECT 정책 "news_cache_select_public", "뉴스 전체 공개" 는 유지 — 변경하지 않음.
