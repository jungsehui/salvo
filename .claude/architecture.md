# Architecture

아직 코드가 없다. 이 문서는 착수 전에 고정해둔 경계와 결정이다.
2026-08-21 외부 설계 리뷰를 반영해 개정했다(결정 3 근거 교체, 결정 8~9 신설).

## 큰 그림

Salvo는 **파일이 진실의 원본**이고 GUI는 그 파일을 편집하는 수단이다.
Bruno는 반대다(GUI가 주, 파일은 산출물). 이 순서가 설계 전반을 결정한다.

```
Extension Host (Node 24, CORS 없음, 프록시 자동)
│
├─ format/        .salvo 파서 + CST 기반 최소 편집 직렬화, JSON Schema
├─ schema/        GraphQL 스키마 로드 (SDL / introspection JSON), 캐시, 실패 리포팅
├─ lang/          graphql-language-service 순수 함수 호출 (별도 프로세스 없음)
├─ runner/        케이스 일괄 실행. 요청 조립 포함. SecretResolver·Transport 를 주입받는다
│   └─ assert/    선언적 어서션 평가 (순수, 의존성 0)
├─ secrets/       SecretStorage 래퍼. runner 에는 SecretResolver 함수로 노출
├─ store/         RunStore(실행 결과), 활성 환경 (workspaceState)
└─ editor/
    ├─ sync.ts    TextDocument ↔ 모델 동기화 (최소 편집, 에코 억제, pull-on-visible)
    └─ panel.ts   CustomTextEditorProvider 등록, webview HTML/CSP, 메시지 프로토콜
src/webview/      React 앱 (별도 tsconfig, 별도 번들)
```

핵심 타입은 셋으로 분리한다. **하나의 모델이 세 목적을 겸하지 않는다.**

| 타입 | 역할 |
|---|---|
| `SalvoFile` | 파일에 영속되는 모델. JSON Schema와 1:1. 여기 없는 필드는 파일에 못 들어간다 |
| `ResolvedRequest` | 변수·시크릿 치환이 끝난 실행 직전 모델 |
| `RunResult` | 실행 산출물. 파일에 절대 저장되지 않는다 |

webview 와이어 포맷은 `protocol.ts`에 따로 둔다. webview가 `selectedCaseIndex`
같은 UI 상태를 필요로 해도 그것이 `SalvoFile`로 새어 들어갈 통로가 없다.

## 결정 1: 네트워크는 extension host에만 둔다

webview에서 직접 `fetch`를 부르지 않는다. 근거 네 개가 전부 같은 방향이다.

| 항목 | webview 직접 | extension host |
|---|---|---|
| CORS | **적용된다.** origin이 `vscode-webview://<hash>`이고 iframe에 `allow-same-origin`이 붙어 opaque가 아니다 | 적용 안 됨. Node 런타임 |
| 프록시 | 경로 없음 | **자동.** `http.proxySupport` 기본값이 `override` |
| 시크릿 | 토큰을 DOM/JS로 내려야 함 | extension host에 머문다 |
| CSP | 대상 origin마다 `connect-src`를 열어야 함 | webview를 잠글 수 있다 |

주의: "extension host를 쓰라"는 문장 형태의 공식 권고는 찾지 못했다(미확인).
위 결론은 검증된 메커니즘에서 도출한 것이다.

쿼리 에디터는 **CodeMirror 6**로 한다. Monaco는 `worker-src blob:`과
`style-src 'unsafe-inline'`을 요구해 CSP가 느슨해지고, `codemirror-graphql`이
이미 `graphql-language-service`를 감싸므로 결정 6과 맞물린다.

## 결정 2: `CustomTextEditorProvider`, priority는 "option"

dirty 표시, Cmd+S, undo/redo, hot exit 백업을 VS Code가 처리한다.
`"default"`면 `.salvo` 파일이 항상 GUI로 열려 원문 편집이 막힌 느낌을 준다.
"파일이 진실의 원본"이라는 전제와 정면 충돌하므로 `"option"`이다.

## 결정 3: 파일 포맷은 YAML. 단, 스키마 지원의 실체를 정확히 안다

**정정 (2026-08-21 리뷰)**: 초안은 "VS Code 내장 YAML 지원이 자동완성과 검증을
붙여준다"고 썼다. **틀렸다.** 이 머신의 내장 확장 97개를 직접 검사한 결과
내장 `yaml` 확장은 `languages`, `grammars`, `configurationDefaults`만 기여하고
`yamlValidation` 구현은 **0건**이다(역검증: `jsonValidation`은 10건).
YAML 스키마 검증은 서드파티 `redhat.vscode-yaml`의 영역이다.

그래도 YAML을 유지한다. 자동완성·검증은 3경로로 확보한다.

1. **GUI가 주 편집면이다.** 자동완성의 주 무대는 webview이고, 여기는 우리 코드다
2. **`contributes.yamlValidation`을 매니페스트에 선언한다.** redhat.vscode-yaml은
   타 익스텐션의 이 기여점을 읽는다(해당 README "Authors of other VS Code
   extensions can use the yamlValidation contribution point"로 확인).
   `extensionDependencies`로 강제하지 않으므로 사용자가 redhat을 안 깔았으면
   조용히 무시되고, CLAUDE.md 하드룰 5(텔레메트리 강제 없음)를 지킨다
3. **자체 파서 diagnostics는 항상 뜬다.** 스키마 위반과 파싱 오류를 `file:line`으로
   보여주는 것은 redhat 유무와 무관하게 우리 파서가 한다

미확인 1건: `.salvo`를 기존 `yaml` 언어 id에 연결할지 자체 id로 갈지.
redhat은 `onLanguage:yaml`로 활성화되므로 자체 id면 경로 2가 죽는다.
v0.1 첫 주에 빈 확장으로 실측해서 정한다.

자체 블록 문법(.bru 스타일)을 포기한 근거를 정직하게 다시 적는다:
파서 개발 2~3주는 **산정 근거 없는 추정**이고, 주 20시간 기준 40~60h는
v0.1 예산의 3분의 1 안팎이다 (초안의 "20%"는 산술 오류였다). 추정이지만
그 시간을 스키마 계층에 쓰는 판단 자체는 유지한다. 참고로 Bruno도 데스크톱
v3.1.0(2026-02)부터 기본 컬렉션 포맷을 yml로 바꿨다 (초안의 "Bruno 5.0"은
버전 혼동이었다. 5.0.2는 VS Code 확장 버전이고 데스크톱 최신은 v4.1.0이다).

**파서는 `yaml`(eemeli)로 확정한다.** `js-yaml`이 아니다. 이유: Document/CST
API가 주석 보존, 소스 range, 미지 키 보존을 제공한다. 세 가지 요구(주석 보존,
`file:line` 오류 표시, 블록 스칼라 안 오프셋 매핑)가 전부 이 API를 가리킨다.
왕복 보존(파싱 → 편집 → 직렬화에서 주석·키 순서·스타일 유지)은 v0.1 첫 주
스파이크로 실측한다.

**포맷 버전을 처음부터 박는다.** 첫 키는 `salvo: 1`. 규칙 둘:
같은 메이저 안에서는 필드 추가만 한다. 미지 키는 왕복에서 보존한다
(CST 최소 편집을 쓰면 후자는 공짜로 따라온다).

## 결정 4: 데이터 모델은 환경 × 케이스. 정직하게는 우선순위 체인

- **환경(environment)**: "어디에 쏘나". baseUrl, 공통 헤더, 공유 변수
- **케이스(case)**: "무엇을 쏘나". 한 요청에 종속되며 이름과 기대값을 갖는다

**환경 정의는 컬렉션 루트의 `salvo.yaml`(프로젝트 매니페스트)에 산다.**
요청 파일이 아니라 매니페스트가 환경의 소유자다. 이 파일은 커밋된다.

```yaml
# salvo.yaml (컬렉션 루트)
salvo: 1
id: 550e8400-e29b-41d4-a716-446655440000   # 시크릿 키 스코프 (결정 5)
environments:
  local: { baseUrl: "http://localhost:3000" }
  dev:   { baseUrl: "https://dev.example.com" }
```

**직교라고 썼던 것을 정정한다(리뷰).** 실제 모델은 우선순위 체인이다:
`기본값 → 환경 → 요청 → 케이스 → 시크릿 치환`. 케이스 `vars`가 환경 값을
덮을 수 있다(의도된 동작이다. 케이스가 마지막 발언권을 갖는다).

경계 규칙 셋을 지금 박는다.

1. `cases[].environments: [local, dev]` 화이트리스트를 지원한다.
   prod에 존재하지 않는 시크릿을 쓰는 케이스는 그 환경에서 건너뛴다
2. **`expect`는 환경 독립이다. 환경마다 기대값이 다르면 다른 파일이다.**
   이 원칙이 없으면 `expect.byEnvironment` 같은 것이 자라난다
3. 케이스의 내부 식별자는 **배열 인덱스**다. 이름은 표시용이고 중복이면
   파서 경고를 낸다 (JSON Schema는 배열 내 속성 유일성을 강제하지 못한다)

```yaml
# login.salvo (형태 예시. errors 부재 검사를 포함하도록 리뷰 반영)
salvo: 1
request:
  method: POST
  url: "{{baseUrl}}/graphql"
  operation: |
    query Me { me { id name } }

cases:
  - name: 정상 토큰
    vars: { token: "{{secret:VALID_TOKEN}}" }
    expect:
      status: 200
      json:
        "data.me.id": { exists: true }
        "errors": { exists: false }        # GraphQL 은 200 + errors 로 실패한다
  - name: 만료 토큰
    vars: { token: "{{secret:EXPIRED_TOKEN}}" }
    expect:
      json: { "errors[0].extensions.code": "UNAUTHENTICATED" }
```

**어서션 어휘 (v0.1에서 닫힌 집합)**

- 슬롯 3개: `status`(숫자 또는 범위 문자열 "2xx"), `headers`(이름 → 매처),
  `json`(경로 → 매처). 응답 메타와 바디 경로를 한 맵에 섞지 않는다
- 경로 문법: 점 표기 + `[n]` 인덱스. 키에 `.`이 들어가면 `["a.b"]` 대괄호
  표기. JSONPath 전체를 지원하지 않는다 (스펙 참조 비용 > 사용 빈도)
- 매처 6개가 전부다: 리터럴(equals), `exists`, `contains`, `matches`(정규식),
  `oneOf`, `length`. **이 목록에 없는 요구는 v0.4 체이닝(capture)이 담당한다**
  고 지금 적는다. 거절 원칙이 없으면 이슈마다 키워드가 하나씩 는다

## 결정 5: 시크릿은 SecretStorage, 키는 프로젝트 ID로 합성

**정정 (리뷰)**: 초안의 키 `${workspaceFolderUri}::...`는 폴더 이동, 이름 변경,
`git worktree`(같은 레포, 다른 경로)에서 전부 깨진다. 워크트리는 매주 있는
일이다. 키 스코프는 경로가 아니라 **`salvo.yaml`에 커밋된 `id`(uuid)**로 한다.

```
salvo/v1/${projectId}/${environmentId}/${varName}
```

이동·리네임·워크트리·멀티루트가 전부 자연 통과한다.

참고: 리뷰는 "SecretStorage가 키를 열거할 수 없다"고 했으나 **틀렸다.**
stable 1.134 `vscode.d.ts:8637`에 `keys(): Thenable<string[]>`가 있다
(직접 확인). 별도 인덱스 없이 열거·정리 UI를 만들 수 있다.

나머지는 유지: 값이 `string`뿐이므로 구조화 자격증명은 직렬화한다. 파일에는
`{{secret:NAME}}` 참조만 남는다. `.env` import는 읽은 값을 SecretStorage로
옮기고 **`.salvo` 파일 쪽을** 참조로 치환한다. **사용자의 `.env`는 절대
수정하지 않는다.**

## 결정 6: GraphQL 언어 기능은 순수 함수 직접 호출 (스파이크로 확정)

당초 계획은 `graphql-language-service-server`를 별도 프로세스로 기동하는
것이었다. **스파이크 결과 그럴 필요가 없다.** 하위 패키지
`graphql-language-service`(MIT, 5.5.2)가 순수 함수를 그대로 export한다.

```js
getAutocompleteSuggestions(schema, queryText, position)  // -> CompletionItem[]
getDiagnostics(queryText, schema)                        // -> Diagnostic[]
getHoverInformation(schema, queryText, position)         // -> Hover contents
getVariablesJSONSchema(facts.variableToType)             // -> JSON Schema
getOutline(queryText)                                    // -> outline trees
```

246KB federation 2 SDL(852 타입)로 전부 실측했고 7개 모두 동작한다.
자동완성은 루트 200개 제안이 cold 1.8ms, median 0ms 미만이다.

**의존성 차이가 결정적이다.**

| 패키지 | 런타임 의존성 | 디스크 |
|---|---|---|
| `graphql-language-service` | **3개** | 1.5MB |
| `graphql-language-service-server` | **24개** (typescript, svelte, vue, @astrojs/compiler, graphql-config ...) | 1.2MB + 전이 |

**결과적으로 접합부가 사라졌다.** 우리가 하는 일은 이것뿐이다.

```
.salvo 파일 → 쿼리 텍스트 + 커서 오프셋 추출 → 순수 함수 호출 → 결과 매핑
```

`getVariablesJSONSchema`는 케이스 모델에 직결되는 보너스다. 케이스별 `vars`
블록에 타입 검증과 자동완성을 그대로 붙일 수 있다.

**치환과 검증의 충돌 규칙**: 오퍼레이션 본문(`operation:` 블록 스칼라) 안에는
`{{}}`를 쓰지 않는다. 치환은 url, 헤더, `variables`에서만 한다. GraphQL에는
이미 `$variables`가 있으므로 잃는 것이 없고, 이 규칙이 없으면
`getDiagnostics`가 `{{token}}` 자리에 거짓 빨간 줄을 긋는다.

스키마 소스 우선순위는 유지한다: 로컬 SDL 파일(기본) → 인트로스펙션 JSON
파일 → URL + 헤더(opt-in). 스키마 파일은 자동 발견하지 않고 명시적으로
지정받는다. 파싱/빌드 실패는 1급 시나리오다(실측: 사내 SDL 5개 중 2개가
깨져 있었다). `file:line`과 원인을 그대로 보여준다.

## 결정 7: 러너는 선언적 어서션만. seam은 함수 타입 두 개

JS 스크립팅(pre/post-request)을 넣지 않는다. 샌드박스·타임아웃·보안 설계
비용이 얻는 것 대비 과하다. 토큰 갱신 등은 v0.4 요청 체이닝으로 푼다.

**`runner/`는 vscode를 import하지 않는다(리뷰 반영).** 필요한 바깥세상은
함수 타입 두 개로 주입받는다.

```ts
type SecretResolver = (name: string) => Promise<string | undefined>;
type Transport = (req: ResolvedRequest) => Promise<HttpResponse>;

runCases(file: SalvoFile, env: Environment, selected: number[],
         deps: { secrets: SecretResolver; send: Transport }): Promise<RunResult[]>
```

`extension.ts`가 composition root로 실물(SecretStorage, 전역 fetch)을 묶는다.
인터페이스도 클래스도 없다. 이것이 성급한 추상화가 아닌 이유: 두 번째 구현이
가설이 아니라 확정이다(테스트 더블, 그리고 v1.0 이후 CLI 러너).

이 덕에 `format/`, `runner/`, `assert/`는 **vscode 없이 vitest로 돈다.**
이것이 v0.1 완료 조건에 들어간다.

## 결정 8: 상태 소유권. webview를 믿지 않는다 (리뷰 신설)

실행 결과와 활성 환경을 webview state에 두면 탭 전환 한 번에 증발한다.
webview는 숨겨지면 파괴된다.

숨겨진 webview로의 postMessage에 대해 **vscode.d.ts가 자기모순이다**
(2026-08-21 확인): 10014행은 "retainContextWhenHidden을 켠 hidden webview는
받는다"고 하고 10072행은 "켜도 못 받는다"고 한다. 어느 쪽이 맞든 아래
pull 기반 설계는 안전하다. push 유실을 전제하고 설계했기 때문이다.
(`retainContextWhenHidden`은 어차피 켜지 않는다.)

| 상태 | 소유자 |
|---|---|
| 실행 결과 | extension host의 `RunStore` (`Map<문서URI, RunResult[]>`) |
| 활성 환경 | `workspaceState` (토큰이 아니므로 평문 허용) |
| UI 로컬 상태 (선택 탭 등) | webview `getState/setState` |

**규칙: push만 믿지 않는다.** webview는 `onDidChangeViewState`로 보일 때마다
전체 상태를 pull한다. 실행 중 탭을 옮겼다 돌아와도 결과가 그대로 있다.

## 결정 9: 문서 ↔ GUI 동기화 (리뷰 신설. 이 프로젝트에서 제일 어려운 코드)

`priority: "option"`은 같은 파일을 텍스트 에디터와 GUI로 동시에 여는 것을
권장하는 선택이다. 그 대가를 정면으로 다룬다.

1. **편집은 항상 최소 range다.** 전체 치환(`serialize(model)` 덮어쓰기)은
   금지. 주석·키 순서·블록 스칼라 스타일이 재작성되고 git diff가 전체 파일로
   뜬다. `yaml`의 CST로 바뀐 노드만 `WorkspaceEdit`한다
2. **에코 억제.** 자기 편집이 `onDidChangeTextDocument`로 되돌아오면 revision
   카운터로 무시한다. 안 하면 편집 → 이벤트 → 리렌더 → 커서 소실 루프
3. **깨진 중간 상태.** 텍스트 쪽에서 타이핑 중 문법이 깨지면 GUI는 마지막
   성공 모델 + 오류 배너를 유지한다. 키스트로크마다 GUI가 무너지면 안 된다
4. **외부 변경**(git checkout 등)은 문서 리로드 이벤트로 온다. 결정 8의
   pull-on-visible이 탭이 숨겨진 동안의 유실을 막는다
5. **붙여넣기 재들여쓰기.** 블록 스칼라는 들여쓰기에 민감하다. GraphiQL에서
   복사한 쿼리를 GUI에 붙여넣으면 GUI가 재들여쓰기를 책임진다

## 모듈 경계 원칙

- `extension.ts`는 얇게. composition root + 커맨드 등록만
- 순수 함수를 기본으로. `format/`, `runner/`, `assert/`, `lang/` 호출부는
  vscode 상태에 손대지 않는다
- 타입은 3분리(`SalvoFile` / `ResolvedRequest` / `RunResult`) + `protocol.ts`.
  ("크로스 모듈 타입은 types.ts 한 곳"은 700줄짜리 전작에서 검증된 규칙이지
  이 규모에는 맞지 않는다. 리뷰 반영)
- JSON Schema가 소스다. TS 타입은 `json-schema-to-typescript`로 생성하고
  CI가 drift를 잡는다. 사람 규율("같은 커밋에서 고친다")을 빌드 스텝으로 대체
