# Operations Backlog

운영 관점의 중장기 아이디어/제도 백로그. 구현 확정이 아니라 검토용 메모.

---

## Division Steward 제도 (체급별 스탯 보정 보조)

### 목적
체급별 선수 스탯 보정을 운영자 혼자 처리하지 않고, 검증된 유저의 집단 지식으로 보조한다.
(현재 fighters.stats 수동 보정은 운영자 1인이 admin 패널에서 직접 수정 → 확장성·신뢰성 한계)

### 후보 조건 (Steward 선발)
- 블랙벨트 이상 등급
- 시즌별 특정 체급 예측 정확도 Top N
- 최소 픽 수 조건 (표본 부족 방지)
- 최근 시즌 성과 가중치 (오래된 성과는 가중 ↓)

### 권한 단계
1. **1단계** — 선수 스탯 수정 *제안* (반영 아님, 큐에 적재)
2. **2단계** — 해당 체급 담당 Steward 2명 이상 동의 시 *반영 후보* 승격
3. **3단계** — 운영자 *최종 승인* 후 실제 fighters.stats 반영
4. **장기** — 신뢰도 높은 Steward에게 특정 체급 *limited edit* 권한 부여 (안전장치 하에)

### 안전장치
- 모든 변경은 `admin_audit_logs`에 기록 (현행 update_fighter audit 패턴 재사용)
- before/after diff 공개 (투명성)
- 하루 수정 횟수 제한 (rate limit)
- 챔피언 / Top5는 운영자 승인 필수 (Steward 단독 반영 불가)
- 자기 픽 예정 경기에 출전하는 선수는 수정 제한 또는 쿨다운 (이해상충 방지)

### 연관 메모
- 수동 스탯 변경 시 `stats_updated_at`이 갱신되어야 추적 가능
  (2026-06-04 `admin_upsert_fighter`에 stats 변경 감지 → `stats_updated_at` bump 로직 추가 완료).
- Steward 반영 경로도 동일하게 stats 변경 시 `stats_updated_at` 갱신 + audit 기록을 따라야 한다.
