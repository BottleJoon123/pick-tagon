-- ================================================================
-- admin_upsert_matchup — 픽 연결 경기 정체성(identity) 변경 가드
--
--   배경: 기존 admin_upsert_matchup은 picks/event_picks가 연결된 matchup이라도
--   event_id·red/blue_fighter_id·red/blue_fighter_name(=정체성)을 자유롭게 변경할 수
--   있었음. 기존 픽/집계의 의미가 사후 변질될 수 있음(예: 픽이 달린 경기를 다른
--   선수/이벤트로 바꿔치기).
--
--   가드: 픽 또는 event_picks가 하나라도 연결된 기존 matchup에서 정체성 5필드가
--   '실제로' 바뀌면 matchup_identity_locked_by_picks 예외. 연결은 레거시까지 포함
--   (picks.matchup_id, picks.fight_id=id::text, event_picks.fight_id=id::text) 검사하고
--   모든 status(pending/win/lose/cancelled)와 정산/취소 픽도 보호 대상에 포함.
--   안전 운영 필드(image/weight_class/card_segment/sort_order/is_main_event)는 계속 수정.
--   신규 INSERT는 기존과 동일하게 허용.
--
--   동시성: UPDATE 경로에서 기존 행을 FOR UPDATE로 잠근 뒤 snapshot→effective
--   identity 계산→IS DISTINCT FROM 비교→연결 검사→조건부 UPDATE. place_pick/
--   change_pick이 matchup을 FOR SHARE로 잠그므로 FOR UPDATE와 경합하여 검사-삽입
--   race가 직렬화됨(픽 선삽입 시 admin은 대기 후 연결 감지·거부 / admin 선변경 시
--   이후 픽은 변경된 canonical 기준 저장).
--
--   정체성 변경 판정은 'payload 키 존재'가 아니라 effective next 값과 기존 값의
--   실제 차이(IS DISTINCT FROM)로만 한다. 관리자 UI(saveMatchupFromModal)는 안전
--   필드만 수정해도 정체성 값을 함께 재전송하므로, 동일 값 재전송은 변경이 아님.
--
--   [중요·동작 정합] fighter_id 할당을 기존 NULLIF(덮어쓰기, 누락 시 NULL)에서
--   COALESCE(NULLIF(...), 기존값)로 정렬한다. 이유: 관리자 편집 모달의 파이터 캐시
--   (_allFightersCache)는 검색 시에만 채워져, 검색 없이 이미지/순서만 수정하면
--   payload의 red/blue_fighter_id가 null로 전송됨. 기존 NULLIF는 이때 fighter_id를
--   조용히 NULL로 덮어써(잠재 손상) 가드가 안전 편집을 오탐 차단하게 됨. event_id/
--   name이 이미 COALESCE 보존이듯 fighter_id도 동일하게 보존하면, 누락=현행 유지가
--   되어 안전 편집은 통과하고 실제 선수 교체(다른 non-null id)만 정체성 변경으로 판정.
--
--   보존: 시그니처(jsonb), private.is_admin() 가드, owner=postgres, SECURITY DEFINER,
--   search_path=public,pg_temp, authenticated EXECUTE 유지. PUBLIC/anon EXECUTE 회수.
--   admin_delete_matchup 및 event 삭제 경로는 이 migration에 포함하지 않음(별도 후속).
-- ================================================================

CREATE OR REPLACE FUNCTION public.admin_upsert_matchup(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_uid             UUID := auth.uid();
    v_id              UUID;
    v_cur             public.matchups%ROWTYPE;
    v_before          JSONB;
    v_after           JSONB;
    v_action          TEXT;
    v_next_event_id   UUID;
    v_next_red_id     TEXT;
    v_next_blue_id    TEXT;
    v_next_red_name   TEXT;
    v_next_blue_name  TEXT;
    v_identity_changed BOOLEAN;
    v_connected        BOOLEAN;
BEGIN
    IF NOT private.is_admin() THEN
        RAISE EXCEPTION 'admin_required';
    END IF;

    v_id := NULLIF(p_payload->>'id', '')::UUID;

    IF v_id IS NOT NULL THEN
        -- ── 기존 행 잠금 (place_pick/change_pick FOR SHARE와 경합 → 검사-삽입 race 차단) ──
        SELECT * INTO v_cur FROM public.matchups WHERE id = v_id FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'matchup_not_found';
        END IF;

        -- ── effective next identity (실제 UPDATE가 쓸 표현과 동일) ──
        v_next_event_id  := COALESCE(NULLIF(p_payload->>'event_id', '')::UUID, v_cur.event_id);
        v_next_red_id    := COALESCE(NULLIF(p_payload->>'red_fighter_id',  ''), v_cur.red_fighter_id);
        v_next_blue_id   := COALESCE(NULLIF(p_payload->>'blue_fighter_id', ''), v_cur.blue_fighter_id);
        v_next_red_name  := COALESCE(NULLIF(p_payload->>'red_fighter_name',  ''), v_cur.red_fighter_name);
        v_next_blue_name := COALESCE(NULLIF(p_payload->>'blue_fighter_name', ''), v_cur.blue_fighter_name);

        v_identity_changed :=
               (v_next_event_id  IS DISTINCT FROM v_cur.event_id)
            OR (v_next_red_id     IS DISTINCT FROM v_cur.red_fighter_id)
            OR (v_next_blue_id    IS DISTINCT FROM v_cur.blue_fighter_id)
            OR (v_next_red_name   IS DISTINCT FROM v_cur.red_fighter_name)
            OR (v_next_blue_name  IS DISTINCT FROM v_cur.blue_fighter_name);

        IF v_identity_changed THEN
            -- 연결 검사(레거시 포함, 모든 status): 하나라도 있으면 정체성 변경 거부
            v_connected :=
                   EXISTS (SELECT 1 FROM public.picks
                            WHERE matchup_id = v_id OR fight_id = v_id::text)
                OR EXISTS (SELECT 1 FROM public.event_picks
                            WHERE fight_id = v_id::text);
            IF v_connected THEN
                RAISE EXCEPTION 'matchup_identity_locked_by_picks';
            END IF;
        END IF;

        v_before := to_jsonb(v_cur);

        UPDATE public.matchups SET
            event_id          = v_next_event_id,
            red_fighter_id    = v_next_red_id,
            blue_fighter_id   = v_next_blue_id,
            red_fighter_name  = v_next_red_name,
            blue_fighter_name = v_next_blue_name,
            red_image_url     = NULLIF(p_payload->>'red_image_url',  ''),
            blue_image_url    = NULLIF(p_payload->>'blue_image_url', ''),
            weight_class      = NULLIF(p_payload->>'weight_class',   ''),
            card_segment      = COALESCE(NULLIF(p_payload->>'card_segment', ''),  card_segment),
            sort_order        = COALESCE(NULLIF(p_payload->>'sort_order',   '')::INT, sort_order),
            is_main_event     = COALESCE((p_payload->>'is_main_event')::BOOLEAN, is_main_event)
        WHERE id = v_id;
        v_action := 'update_matchup';
    ELSE
        -- 신규 INSERT (기존 동작 유지)
        INSERT INTO public.matchups (
            event_id, red_fighter_id, blue_fighter_id,
            red_fighter_name, blue_fighter_name,
            red_image_url, blue_image_url, weight_class,
            card_segment, sort_order, is_main_event
        ) VALUES (
            NULLIF(p_payload->>'event_id', '')::UUID,
            NULLIF(p_payload->>'red_fighter_id',  ''),
            NULLIF(p_payload->>'blue_fighter_id', ''),
            p_payload->>'red_fighter_name', p_payload->>'blue_fighter_name',
            NULLIF(p_payload->>'red_image_url',  ''), NULLIF(p_payload->>'blue_image_url', ''),
            NULLIF(p_payload->>'weight_class', ''),
            COALESCE(NULLIF(p_payload->>'card_segment', ''), 'main'),
            COALESCE(NULLIF(p_payload->>'sort_order', '')::INT, 1),
            COALESCE((p_payload->>'is_main_event')::BOOLEAN, false)
        ) RETURNING id INTO v_id;
        v_action := 'insert_matchup';
    END IF;

    -- 성공한 변경만 감사 기록 (거부는 RAISE로 중단되어 audit/matchup 모두 변경 0)
    SELECT to_jsonb(m) INTO v_after FROM public.matchups m WHERE id = v_id;
    INSERT INTO public.admin_audit_logs (admin_user_id, action, entity_table, entity_id, before_data, after_data)
    VALUES (v_uid, v_action, 'matchups', v_id::TEXT, v_before, v_after);

    RETURN jsonb_build_object('ok', true, 'matchup_id', v_id);
END;
$$;

-- ── 권한: PUBLIC/anon EXECUTE 회수, authenticated 유지 ──
REVOKE ALL ON FUNCTION public.admin_upsert_matchup(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_upsert_matchup(jsonb) TO authenticated;
