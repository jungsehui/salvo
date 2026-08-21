# Research: 왜 만드는가, 그리고 차별점은 진짜인가

조사일 2026-08-20 ~ 08-21. 모든 수치는 그날 직접 조회한 값이다.
검증 방법을 함께 적는다. 근거 없는 항목은 "미확인"으로 남긴다.

## 요약

**v0.1 시점에 방어 가능한 차별점은 하나다: "GraphQL 스키마 인식 + 케이스 모델"의 결합.**
나머지 세 개는 v0.2 이후이거나 종속 변수다. 이걸 알고 시작해야 한다.

| 후보 차별점 | 상태 | 근거 |
|---|---|---|
| 예외 케이스 중심 모델 (환경 × 케이스) | **방어 가능. 유일** | 조사한 8개 도구 중 어느 것도 케이스를 1급 개념으로 두지 않는다 |
| 텍스트 파일 중심 + GraphQL 스키마 인식 | **결합이 차별점** | 파일 중심은 REST Client/httpYac이 이미 한다. 둘 다 GraphQL 스키마를 모른다 |
| GraphQL 깊이 (빌더 + 문서 패널 + 히스토리) | **v0.2까지 미확보** | Bruno에 없는 3개가 맞지만 v0.1에 안 들어간다 |
| VS Code 네이티브 품질 | **단독으로는 차별점 아님** | 종속 변수. 이것만으로 갈아타지 않는다 |

## 경쟁 지형

마켓플레이스 `extensionquery` API 직접 조회 (`filterType 7`, 2026-08-20).

| 도구 | 최신 / 갱신 | 설치 | 평점 (표본) | 치명상 |
|---|---|---|---|---|
| Thunder Client | 2.41.1 / 2026-08-07 | 7.44M | 2.39 (751표) | 라이선스 |
| REST Client | 0.25.1 / **2022-08-19** | 7.50M | 4.91 (388표) | 릴리스 4년 정지 |
| Postman 공식 | 1.19.1 / 2025-12-10 | 2.62M | 2.99 (93표) | 로그인 필수 |
| **Bruno** | 5.0.2 / 2026-07-17 | 211K | 3.84 (37표) | 거의 없음 |
| vscode-graphql | 0.13.4 / 2026-05-14 | 2.78M | 3.22 (45표) | 실행 기능 없음 |
| vscode-apollo | 2.6.6 / 2026-06-09 | 719K | 2.47 (60표) | 실행 기능 없음 |
| vscode-graphql-execution | 0.3.4 / 2026-05-14 | 282K | 2.00 (**3표**) | 변수 저장 불가 |
| httpYac | 6.16.7 / 2025-03-30 | 134K | 4.96 (27표) | GraphQL 얕음 |

평점은 표본이 작을수록 신호가 약하다. 특히 graphql-execution의 2.00은 3표라
품질 근거로 쓰지 않는다. Thunder Client 2.39는 751표라 신뢰할 만하다.

Hoppscotch는 **VS Code 익스텐션이 존재하지 않는다.** 요청 이슈
`hoppscotch/hoppscotch#4068`이 2024-05-16 등록 후 지금도 open이고,
마켓플레이스와 Open VSX 검색 결과가 모두 0건이다.

### 5개 기능 커버리지

| | HTTP | GraphQL(Apollo급) | 환경 | 터널링 | 케이스별 저장·실행 |
|---|---|---|---|---|---|
| Thunder Client | O (무료판 X) | 부분 | O (무료판 X) | X | 부분 |
| REST Client | 부분 | 부분 | O | X | O |
| Postman | O | 부분 | O | X | 부분 |
| Bruno | O | 부분(최상) | O | X | O |
| httpYac | O | 부분 | O | X | O |
| vscode-graphql(+exec) | X | 부분 | 부분 | X | 부분 |

## 진짜 경쟁자는 Bruno 하나다

Postman도 Apollo도 아니다. Bruno는 MIT, 로그인 없음, 텔레메트리는 소스에서
no-op으로 박제되어 있고(`src/webview/providers/App/useTelemetry.ts`),
`.bru` 파일 기반이며, HTTP와 환경과 케이스 저장을 전부 한다.

GraphQL도 얕지 않다. 소스를 직접 열어 확인했다:

```
src/webview/components/RequestPane/GraphQLSchemaActions/useGraphqlSchema.ts:3
  import { buildClientSchema, buildSchema, IntrospectionQuery } from 'graphql';
:58  const loadSchemaFromFile = async () => { ... }
:59  ipcRenderer.invoke('renderer:load-gql-schema-file')
```

**SDL 파일 주입이 이미 된다.** GraphiQL 파생 에디터라 자동완성과 hover도 있다.

빠진 것은 셋이다 (2026-08-21 팩트체크로 정정. 초안은 문서 패널이 있다고
잘못 썼다).

1. **비주얼 쿼리 빌더 없음** (데스크톱 앱에는 v3.3.0부터 있다. 이식 여부는 추측)
2. **오퍼레이션 히스토리 없음** (Trees API 1207개 경로에 `history` 0건)
3. **문서 패널은 동작하지 않는 플레이스홀더다.** `bruno-graphql-docs.tsx` 주석
   원문: "This is a placeholder - the full implementation would require the
   graphql-docs package". 렌더링 결과는 데스크톱 앱 안내문이다

그리고 구조적 차이가 하나 더 있다. Bruno는 **전부 webview GUI**다. 파일은
GUI의 산출물이다. Salvo는 그 순서를 뒤집는다.

## Thunder Client는 회사에서 쓰면 EULA 위반이다

공지 `thunderclient/thunder-client-support#1648` (2024-11-25) 원문:

- "For **Non-Commercial** use only"
- `0 Environments`, 3 Collections, 15 Requests Per Collection, No OAuth 2
- "Employees of organizations with more than five employees are not permitted
  to use the free version."
- "The use of **older versions** of the extension is **prohibited**"

평점 2.39(751표)가 결과다. 회사는 5인 초과 조직이므로 무료 사용이 금지된다.

## REST Client은 릴리스가 죽었다

마켓플레이스 최신판이 2022-08-19의 0.25.1이다. 그런데 master의 README는
그 뒤 머지된 기능을 광고한다. AWS Cognito는 2024-08-15, OIDC 토큰은
2024-08-05에 머지되었고 CHANGELOG 0.25.1 항목에는 둘 다 없다.
**README를 보고 기대한 기능이 설치본에 없는 상태다.**

open PR 61건, 최근 1년 이슈 종료 4건. 평점 4.91은 "쓰는 사람만 쓰는" 결과다.

## GraphQL 진영의 두 강자는 실행을 구조적으로 포기했다

**Apollo (`apollographql.vscode-apollo`, 719K 설치)**: 등록 명령이 5개뿐이고
실행 명령이 없다. "Run in Studio"는 실행이 아니라 브라우저 링크다.
`src/language-server/project/client.ts`가 오퍼레이션을 LZString으로 압축해
`studio.apollographql.com` URL을 만들고 hover 메시지로 붙인다.

**GraphQL Foundation (`GraphQL.vscode-graphql`, 2.78M 설치)**: 등록 명령이
`restart`와 `showOutputChannel` 둘뿐이다. 실행은 별도 익스텐션
`vscode-graphql-execution`(평점 2.00)으로 분리되어 있고, 그마저 변수를
**매번 다이얼로그로 묻고 저장하지 않는다.**

즉 "에디터 안에서 인증 붙은 GraphQL 쿼리를 변수 바꿔가며 반복 실행"이라는
시나리오는 아무도 커버하지 않는다. 이것이 시장의 실제 공백이다.

## 회사 환경이 이 설계를 강제한다

사내 레포를 직접 열어 확인한 사실이다.

**인트로스펙션은 로컬 dev에서도 꺼져 있다.**

| 서버 | 설정 |
|---|---|
| Apollo Gateway | `introspection: false` (하드코딩) |
| 메인 API 서버 | `introspection: false` (하드코딩) |
| 서브 서비스 A | `introspection: false` (하드코딩) |
| 서브 서비스 B | `introspection: false` (하드코딩) |

넷 다 `NODE_ENV` 분기가 없는 하드코딩이다. Apollo Server의 기본값은
`NODE_ENV === 'production'`일 때만 off인데, 여기는 환경 무관하게 off다.
따라서 **인트로스펙션 기반 도구는 회사 서버에 대해 처음부터 작동하지 않는다.**

**그런데 SDL 파일은 전부 실재한다.**

| 레포 | 파일 | 크기 |
|---|---|---|
| 메인 API | 생성 SDL (federation 2) | 246KB |
| 메인 API | 서브그래프 SDL | 382KB |
| 메인 API | schema-first 병합본 | 51KB |
| 서브 서비스 A | SDL | 61KB |
| 서브 서비스 B | SDL | 21KB |

메인 API는 `autoSchemaFile: { path: 'typedefs-nest/generated.graphql',
federation: 2 }`로 이 파일을 생성한다.

SDL만이 아니다. **인트로스펙션 JSON도 이미 사내에 있다.**
`메인 API의 인트로스펙션 JSON`(3.5MB)과
`서브 서비스 B의 인트로스펙션 JSON`이 실재한다 (2026-08-21 확인).
스키마 소스 2순위(인트로스펙션 JSON 파일) 경로가 이미 깔려 있다는 뜻이다.

**팀은 이미 이 방식을 쓰고 있다.**
`사내 프론트 레포의 `.graphqlrc.yml`` 상단 주석이
"VSCode 확장: GraphQL: Language Feature Support"다. 로컬 SDL 파일 +
graphql-config + 공식 무료 익스텐션 조합이 이미 돌고 있다.
`.vscode/extensions.json`은 4개 레포가 `apollographql.vscode-apollo`를
권장하고, 그중 1개(프론트 레포 중 하나)가 `graphql.vscode-graphql`을 추가로
권장한다.

**회사는 GraphOS 그래프를 이미 보유한다.**
게이트웨이의 환경변수 스키마가 GraphOS 자격증명을 필수로 요구한다.
`ApolloServerPluginUsageReportingDisabled()`로 usage reporting은 차단한다.

이 마지막 사실은 **Salvo에 불리한 근거다.** 슈퍼그래프 스키마가 이미 Apollo
레지스트리에 있으므로, GraphOS Studio Explorer가 이미 사용 가능한 상태일
가능성이 높다. 다만 개인 계정 권한 유무는 **미확인**이다. 이걸 먼저 확인하고,
이미 쓸 수 있다면 "브라우저를 안 떠나도 된다"가 Salvo의 GraphQL 차별점에서
차지하는 비중이 줄어든다는 것을 인정해야 한다.

## SDL 파싱 성능: 위험이 아니다 (2026-08-21 실측)

Node 24.15.0(익스텐션 호스트는 24.18.1), graphql 16.10.0, 각 12회 반복.

`typedefs-nest/generated.graphql` 246KB, federation 2, 852 타입:

| 작업 | cold | median |
|---|---|---|
| `readFileSync` | 1.2ms | |
| `parse` (AST만) | 9.1ms | 3.2ms |
| `buildSchema` (`assumeValidSDL`) | 7.9ms | 6.6ms |
| `buildSchema` (기본, 검증 포함) | 20.3ms | 13.9ms |
| `printSchema` | 9.5ms | 5.7ms |
| `buildClientSchema` (JSON 경로) | 5.6ms | 3.5ms |

382KB 서브그래프도 `buildSchema` 기본이 cold 26.0ms / median 22.1ms.
메모리는 heapUsed +14.5MB.

모듈 로드도 무시할 수 없다. `require('graphql')`는 첫 실행(파일 캐시 없음)
약 46~50ms, 워밍 상태 재실행 약 20~24ms다 (2026-08-21 재측정으로 정정.
초안의 "파싱보다 2배 비싸다"는 순차 실행 측정 설계 탓에 과장됐다.
워밍 기준으로는 모듈 로드 약 24ms 대 빌드 약 26ms로 비슷하다).

콜드 경로 총합은 최악 기준 약 70ms, 워밍 기준 약 40ms다.
"느낌상 즉각"인 100ms 안에 들어온다. 워커도, 캐시 계층도, 프로그레스 표시도
필요 없다.

`graphql`의 lazy load는 여전히 한다. 수십 ms를 익스텐션 활성화 지연에 얹을
이유가 없다. 다만 이것은 상식적 위생이지 결정적 병목 제거가 아니다.

## LSP 접합 스파이크: 접합부가 존재하지 않는다 (2026-08-21 실측)

당초 v0.1 설계 리스크 1위였던 항목이다. 결과는 통과를 넘어 아키텍처 단순화다.

**질문**: `graphql-language-service-server`가 graphql-config의 `documents`를
전제하는데, `.salvo` 안의 쿼리 블록에 어떻게 붙일 것인가.

**답**: 서버를 쓸 필요가 없다. 하위 패키지 `graphql-language-service`(MIT,
5.5.2)가 순수 함수를 export한다. `(schema, queryText, position)`을 넘기면
끝이고 config도 프로세스도 개입하지 않는다.

246KB federation 2 SDL(852 타입)로 실측한 결과다.

| 함수 | 결과 | 시간 |
|---|---|---|
| `getAutocompleteSuggestions` (Query 루트) | 제안 200개 | cold 1.8ms |
| `getAutocompleteSuggestions` (중첩 선택) | 제안 5개, 타입 범위 정확 | 0.3ms |
| `getDiagnostics` (오류 쿼리) | `Cannot query field "..." on type "Query"` 1건 | 6.2ms |
| `getDiagnostics` (정상 쿼리) | 0건 | 0.3ms |
| `getHoverInformation` | `Query.industryCategories: [IndustryCategory!]!` | 0.2ms |
| `getVariablesJSONSchema` | 변수 타입에서 JSON Schema 생성 | 0.7ms |
| `getOutline` | outline 트리 1개 | 0.2ms |

자동완성 20회 반복은 median 0ms 미만이다.

**의존성 비교가 서버를 배제하는 결정적 근거다.**

| 패키지 | 런타임 의존성 | 로드 시간 | 디스크 |
|---|---|---|---|
| `graphql-language-service` | **3개** | +11.4ms | 1.5MB |
| `graphql-language-service-server` | **24개** | 미측정 | 1.2MB + 전이 |

서버 쪽 24개에는 `typescript`, `svelte`, `svelte2tsx`, `vue`,
`@astrojs/compiler`, `@babel/parser`, `graphql-config`, `fast-glob`,
`dotenv`가 들어 있다. Vue/Svelte/Astro 파일 안의 태그드 템플릿을 파싱하려고
그 프레임워크 컴파일러를 전부 끌고 오는 구조다. Salvo는 자체 포맷만 다루므로
하나도 필요 없다.

**부수 소득**: `getVariablesJSONSchema`가 오퍼레이션의 변수 타입에서 JSON
Schema를 만들어준다. 케이스별 `vars` 블록에 타입 검증과 자동완성을 그대로
붙일 수 있다. 케이스 모델이 공짜로 한 단계 올라간다.

**영향**: v0.1 예산이 168h에서 146h로 줄었다(스파이크 12h 소멸, LSP 통합
20h → 10h). 위험 목록에서 1위 항목이 사라졌다.

## 사내 SDL 5개 중 2개는 스키마로 쓸 수 없다 (2026-08-21 실측)

성능 측정 과정에서 나온 부수 발견이다. 설계에 직접 영향을 준다.

| 파일 | 크기 | 상태 |
|---|---|---|
| 메인 API 생성 SDL | 246KB | 정상 |
| 메인 API 서브그래프 SDL | 382KB | 정상 |
| 서브 서비스 A SDL | 61KB | 정상 |
| 메인 API schema-first 병합본 | 51KB | **빌드 실패** |
| 서브 서비스 B의 별도 SDL | 21KB | **파싱 실패** |

**서브 서비스 B의 별도 SDL**: 53, 55, 57, 59, 61행 5개 필드에 타입 표기가
없다. `chatMentorAuthenticationStatus` 뒤에 `: String` 같은 것이 없어
파서가 54행에서 `Expected ":", found BlockString`으로 멈춘다. 2년 넘게 갱신이 없고 어떤 설정 파일도 이 파일을 참조하지 않는다. 방치된 문서
파일로 보인다.

**메인 API의 schema-first 병합본**: 1657행이
`ActivityScrapUpdateInput!`을 참조하는데 정의가 없다(input 105개 중 이것만
누락). `codegen.yml`의 schema 입력은 `typedefs/**/*.graphql`이라 이 파일이
아니다. 불완전한 산출물이다.

**설계 시사점 두 개.**

1. `.graphql` 파일을 자동 발견해서 스키마로 삼으면 안 된다. graphql-config로
   명시적으로 가리키게 한다(`architecture.md` 결정 6과 일치).
2. **파싱/빌드 실패를 1급 시나리오로 다룬다.** 예외가 아니다. 실측으로 5개 중
   2개가 깨져 있었다. `file:line`과 원인을 그대로 보여주고, 조용히 빈 스키마로
   넘어가지 않는다.

## 터널링은 만들 수 없다

현행 stable `vscode.d.ts`(release/1.134)를 직접 받아 검증했다.

| 검사 | 결과 |
|---|---|
| `Tunnel` 매치 | **0건** |
| `openTunnel` 매치 | **0건** |
| (역검증) `SecretStorage` | 4건 |
| (역검증) `CustomTextEditorProvider` | 7건 |

역검증 두 건이 잡히므로 grep은 정상 동작한다. Tunnel API는 stable에 없다.

`vscode.d.ts:10879` 원문: "This is a no-op if the extension is running on the
client machine." 즉 로컬 데스크톱에서 `asExternalUri('http://localhost:3000')`은
입력과 동일한 URI를 그대로 돌려준다.

proposed `openTunnel`의 docstring은 "@throws When run in an environment
without a remote"라고 못박는다. proposed API 익스텐션의 배포를 막는 실질
차단선은 `vsce`가 아니라 런타임이다 (2026-08-21 정정: `vsce`의 거부에는
`--allow-all-proposed-apis` 등 우회 플래그가 있다. 그러나 우회해서 올려도
사용자의 stable VS Code가 proposed API를 활성화하지 않는다. 허용목록인
`product.json`의 `extensionEnabledApiProposals`는 Microsoft 비공개 빌드에만
있다).

**결론: 자체 구현 경로가 없다. 로드맵에서 제외한다.**
VS Code 내장 Ports 뷰가 dev tunnels 기반으로 이미 로컬 서비스를 인터넷에
노출한다. README에서 그쪽을 안내한다.

## 미확인 항목

플랜의 근거로 쓰기 전에 확인이 필요한 것들이다.

1. **님 계정의 GraphOS Studio Explorer 접근 권한.** 위 "불리한 근거" 참조.
   가장 먼저 확인해야 한다.
2. ~~246KB / 382KB SDL 파싱 시간~~ **2026-08-21 측정 완료. 아래 참조.**
3. Bruno VS Code 확장의 쿼리 빌더/히스토리 부재는 **파일명 grep 기반**이다.
   다른 이름의 컴포넌트로 존재할 가능성을 배제하지 못했다. 실제 설치해
   UI를 봐야 확정된다.
4. `.http` 문법으로 환경 × 케이스를 얼마나 자연스럽게 표현할 수 있는지.
   import 매핑 설계 전에 확인 필요.
5. OpenCollection YAML 스펙의 성숙도. Bruno 5.0이 신규 생성에 권장하기
   시작했으나 스펙 문서를 직접 읽지 않았다.
