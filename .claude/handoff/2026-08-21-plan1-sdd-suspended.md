# 핸드오프: plan 1 (코어 엔진) SDD 실행, 최종 리뷰 직전 중단

작성 2026-08-21. 사용자 지시로 중단. 다음 세션은 이 파일 하나로 재개 가능해야 한다.

## 한 줄 상태

**11개 태스크 전부 구현·리뷰 완료, 모든 게이트 그린. 남은 것은 최종
whole-branch 리뷰부터이며, API 529(서버 과부하)로 3회 실패한 지점에서 멈췄다.**

## 어디서 무엇이 돌아가고 있었나

| 항목 | 값 |
|---|---|
| 브랜치 | `feat/v01-core-engine` (워크트리 `.worktrees/v01-core-engine/`) |
| HEAD | `29f6dc5` (base `e5126f3`, 26 커밋) |
| 게이트 | `npm test` 50/50 (11 파일), `npm run check` 클린, `npm run gen:check` 클린, `grep -ri linkareer src tests examples schemas` 0건 |
| 플랜 | `docs/superpowers/plans/2026-08-21-v01-core-engine.md` (실행 중 10여 회 수정됨. 수정 이유는 레저의 Ruling 항목들) |
| SDD 레저 | `.superpowers/sdd/2026-08-21-v01-core-engine/progress.md` (**지우지 말 것.** 런이 끝난 게 아니라 중단된 것) |
| 최종 리뷰 패키지 | `.superpowers/sdd/2026-08-21-v01-core-engine/review-e5126f3..29f6dc5.diff` (160KB, 생성 완료) |

main 브랜치는 건드리지 않았다. main 에는 문서만 있고(public GitHub에 push 됨),
구현은 전부 이 워크트리 브랜치에만 있다. **아직 push 하지 않았다.**

## 지금까지 한 것 (완료)

Subagent-Driven Development로 11개 태스크를 순차 실행했다. 태스크마다
구현자(haiku) → 리뷰어(sonnet) → 필요 시 픽스 라운드 + scoped 재리뷰.

| Task | 내용 | 결과 |
|---|---|---|
| 1 | 스캐폴드 + no-vscode 가드 | 픽스 1회 (가드 정규식 강화) |
| 2 | JSON Schema 2종 + 타입 생성 + drift 게이트 | 클린 |
| 3 | `.salvo` 파서 (line/col 이슈) | 픽스 1회 (col 어서션 추가) |
| 4 | yaml 라운드트립 증명 (`updateScalar`) | 픽스 1회 (오류경로·strict 계약 테스트). **아키텍처 베팅 검증됨** |
| 5 | `salvo.yaml` 매니페스트 파서 | 클린 |
| 6 | 환경×케이스 변수 해석 (`resolveCase`) | 클린. 구현자가 플랜 버그(lastIndex 순서)를 고침 |
| 7 | json-path (닫힌 문법) | 픽스 1회 (Critical 2: 프로토타입 체인, 데드 가드 + `]` quoted key) |
| 8 | 매처 6종 + `evaluateExpect` | 클린. 구현자가 플랜 버그(어서션 순서)를 고침 |
| 9 | 러너 (`runCases`) | 픽스 1회 (selected 인덱스 dedupe) |
| 10 | fetch 트랜스포트 | 픽스 1회 (Critical: 대소문자 헤더 콤마 결합) |
| 11 | quickstart 예제 + e2e | 클린. Global-first 종료 게이트 전부 그린 |

**패턴 요약**: 발견된 결함 대부분이 구현이 아니라 **플랜 참조 코드의 버그**였고
(리뷰어 검증 후 플랜을 코드에 맞춰 교정), 구현자가 두 번은 플랜 버그를 스스로
고쳤다. 모든 결정은 레저의 `Ruling:` 줄에 근거와 함께 있다(13건).

## 다음에 할 것 (순서대로)

1. **최종 whole-branch 리뷰 디스패치** (중단 지점).
   - 모델: fable 또는 opus (가장 강한 것. 529가 계속되면 시간을 두고 재시도)
   - 템플릿: superpowers requesting-code-review 의 `code-reviewer.md`
   - 입력: 위 리뷰 패키지 경로 + 플랜 + `.claude/architecture.md`(결정 3,4,5,7,10)
     + 레저의 deferred/Ruling 줄들
   - 특별 트리아지 요청: 교차 태스크 통합(모듈 간 타입 계약, 헤더 소문자화 이중
     수행), e2e가 못 덮는 통합 엣지, 그리고 **Task 6 deferred: 순환 변수
     `a: '{{a}}'` 무한 재귀 스택오버플로** — 임의 사용자 파일을 받는 코어라
     merge 차단 여부를 리뷰어가 판정해야 함
2. 최종 리뷰 findings → **픽스 서브에이전트 1회**(전체 findings 일괄) + scoped
   재리뷰 1회. 두 번째 픽스 웨이브는 없음(잔여는 룰링으로 park)
3. 클린 후: SDD 워크스페이스 삭제 → **finishing-a-development-branch 스킬**
   (merge to main, push 는 사용자 확인 후. push 전 `gh auth switch -u jungsehui`)
4. 그 다음 플랜 2 작성(GraphQL 계층: SchemaSource 소비, lazy import, lang 래퍼)
   → 플랜 3 (VS Code 통합: custom editor, RunStore, SecretStorage 키
   `salvo/v1/${manifest.id}/${env}/${var}`, **GUI는 폼 문자열을 스키마 타입으로
   강제변환 후 updateScalar 호출** — Task 4 룰링의 carried note)

## Deferred minors (최종 리뷰가 트리아지할 12건)

레저의 `minor (deferred)` 줄 참조. 요지: 순환 변수 스택오버플로(위 1번),
시크릿 미메모이즈, out-of-range 인덱스 무음 드롭, 스키마 엣지 테스트 부재,
매니페스트 검증 이슈가 항상 1:1 위치로 보고, `[01]` 인덱스 허용,
어서션 순서 주석 부재, e2e 픽스처 method/url 미검증 등.

## 재개 명령 (참고)

```bash
cd ~/PersonalWorkspace/salvo/.worktrees/v01-core-engine
tail -30 .superpowers/sdd/2026-08-21-v01-core-engine/progress.md
git log --oneline -5
npm test && npm run check && npm run gen:check
```
