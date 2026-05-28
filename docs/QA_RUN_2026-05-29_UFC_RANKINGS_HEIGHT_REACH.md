# QA Audit: UFC Rankings Height/Reach Data
> 실행일: 2026-05-29  
> 방법: DB read-only SQL + 코드 정적 분석  
> DB write 없음

---

## Verdict: 코드 수정 완료 (cross-reference fix), 일부 DB 데이터 부정확 잔존

---

## 1. 원인 분석

### 데이터 흐름
```
ufc_rankings 테이블 (height, reach 컬럼)
  ↓ loadUFCRankings()
ufcRankingsDB (메모리)
  ↓ renderUFCRankings()
랭킹 UI 표시
```

### fighters 테이블 (더 정확한 데이터 소스)
```
fighters.height_cm, fighters.reach_cm (소수점 정밀값)
  → openUFCFighterProfile()에서 이미 사용 중 (프로필 모달)
  → 기존 loadUFCRankings()에서는 미사용 ← 이것이 원인
```

---

## 2. DB 데이터 샘플 (Read-only audit)

### ufc_rankings.height vs fighters.height_cm 비교

| Fighter | Division | ufc_rankings.height | fighters.height_cm | 오류 |
|---|---|---|---|---|
| Ilia Topuria | lw (C) | 178cm | **170.18cm** | ❌ +8cm |
| Umar Nurmagomedov | bw (#2) | 170cm | **172.72cm** | ❌ -3cm |
| Merab Dvalishvili | bw (#1) | 170cm | **167.64cm** | ❌ +2cm |
| Sean O'Malley | bw (#3) | 180cm | 180.34cm | ✅ |
| Ciryl Gane | hw (#1) | 193cm | 193.04cm | ✅ |
| Alexander Volkanovski | fw (C) | 168cm | 167.64cm | ✅ |

### reach 현황
- `ufc_rankings.reach`: **전체 '—'** (rank 1-10) 또는 NULL (rank 11-15)
- `fetchAndSyncUFCRankings()` 파서가 UFC.com에서 reach를 스크래핑하지 않음
- `fighters.reach_cm`: 일부 정밀값 존재 (e.g., Merab 172.72cm, Sean O'Malley 182.88cm)

### 데이터 패턴
- **Rank 1-10**: height 있음(일부 부정확), reach = '—', record/nation = 빈 문자열
- **Rank 11-15**: height=NULL, reach=NULL, record=NULL, nation=NULL
- 최신 sync에서는 선수 이름/디비전/순위만 업데이트하고 height는 미입력

---

## 3. 수정 사항 (Release-Fix-15D)

### A. Code fix — `loadUFCRankings()` cross-reference
**변경 전**: `ufc_rankings.height` 단독 사용  
**변경 후**: `fighters` 테이블을 병렬 쿼리하여 `fighters.height_cm` 우선 사용, 없으면 `ufc_rankings.height` fallback

```javascript
// fighters 테이블 lookup map
var fMap = {}; // name.toLowerCase() → {height_cm, reach_cm}

// 높이 우선순위:
// 1. fighters.height_cm → Math.round() + ' cm'
// 2. ufc_rankings.height fallback

// 리치 우선순위:
// 1. fighters.reach_cm → Math.round() + ' cm'
// 2. ufc_rankings.reach fallback ('—' 유지)
```

**효과**: Ilia Topuria 178cm → **170cm** (정확), Umar Nurmagomedov 170cm → **173cm** (정확)

### B. UI fix
- 컬럼 헤더 "신장/리치" → "신장" (reach는 실질적으로 항상 '—'이므로 misleading 제거)
- height/reach 텍스트: `text-[9px] lg:text-[10px]` → `text-[10px] lg:text-xs`
- height 색상: `text-gray-500` → `text-gray-400` (가독성 향상)

---

## 4. 미해결 항목

| 항목 | 상태 | 비고 |
|---|---|---|
| fighters 테이블에 없는 선수 (신규 랭커) | 잔존 | ufc_rankings.height fallback 사용 (부정확 가능) |
| reach 전체 미입력 | 잔존 | fighters.reach_cm으로 개선됐지만 fighters에도 없는 선수 존재 |
| Rank 11-15 height=NULL | 잔존 | fighters 테이블에 있으면 cross-reference로 해소됨 |
| ufc_rankings 챔피언 정합성 | 별도 (M-1 HOLD) | Release-Fix-Closeout 참고 |

---

## 5. 권장 추가 작업 (출시 후)

1. `fetchAndSyncUFCRankings()` 실행 후 fighters 테이블에서 height/reach 자동 업데이트 로직 추가
2. fighters 테이블에 없는 신규 랭커 수동 등록 (Admin 파이터 탭)
3. reach 데이터 scrap 또는 수동 입력 방안 검토
