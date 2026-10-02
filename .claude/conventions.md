# Conventions: DO and DON'T

`custom-intellij-nav`에서 검증된 규칙과, 조사에서 확인된 VS Code API 제약에서
도출한 규칙이다. v0.1 코드는 전부 이 규칙 아래에서 작성됐다.

## DO

- **`extension.ts`를 얇게 유지한다.** 진입점은 커맨드 등록과 subscription
  push만 한다. 로직은 `format/`, `http/`, `graphql/`, `runner/` 등으로 간다.
- **순수 함수를 기본으로 쓴다.** 포맷 파서, 어서션 평가기, 스키마 변환은
  `vscode` 상태를 만지지 않는다. 입력을 받아 출력을 낸다. 테스트가 쉬워지고
  webview 쪽에서 재사용할 여지가 생긴다.
- **크로스 모듈 타입은 `src/types.ts` 한 곳에 둔다.** 순환 타입 임포트를 막는다.
- **네트워크 호출은 extension host에서만 한다.** webview는 `postMessage`로
  요청하고 결과를 받는다. 이유는 `architecture.md` 결정 1.
- **시크릿은 `SecretStorage`에만 쓴다.** 키는
  `${workspaceFolderUri}::${environmentId}::${varName}` 형태로 직접 합성한다.
  `SecretStorage`에 워크스페이스 스코프가 없기 때문이다.
- **package.json을 바꾸면 patch 버전을 올린다.** 문구 수정이라도. VS Code가
  익스텐션을 공격적으로 캐시해서, 버전 없이 같은 VSIX를 설치하면 반영이
  안 될 수 있다.
- **CHANGELOG.md와 README.md를 코드와 같은 커밋에서 갱신한다.**
- **`.salvo` 포맷을 바꾸면 JSON Schema도 같은 커밋에서 바꾼다.** 둘이 갈라지면
  사용자가 에디터에서 보는 자동완성이 거짓말을 하기 시작한다.

- **`graphql` 패키지를 lazy load한다.** `require('graphql')`는 콜드 약 46~50ms,
  워밍 약 20~24ms다 (2026-08-21 재측정). `activate()`에서 부르면 그 시간이
  활성화 지연에 얹힌다. 스키마가 실제로 필요한 시점에 동적 import한다.
- **스키마 로드 실패를 1급 시나리오로 처리한다.** 실측 결과 사내 SDL 5개 중
  2개가 파싱 또는 빌드에 실패했다. `file:line`과 원인을 그대로 보여주고,
  조용히 빈 스키마로 넘어가지 않는다.

- **사용자 노출 문자열은 영어로 쓴다.** 오류 메시지, 커맨드, 설정 설명 전부.
  마켓플레이스 사용자는 전 세계인이다. 한국어는 l10n 파일로 추후 추가한다.
- **테스트 픽스처는 합성으로 만든다.** 회사 스키마, 회사 URL, 회사 도메인
  용어를 레포에 넣지 않는다. 성능 검증에 실물 대형 SDL이 필요하면 로컬에서만
  돌리고 커밋하지 않는다.

## DON'T

- **`graphql-language-service-server`를 의존성에 넣지 않는다.** 런타임 의존성이
  24개이고 `typescript`, `svelte`, `vue`, `@astrojs/compiler`를 전이로 끌고 온다.
  그 프레임워크 파일 안의 태그드 템플릿을 파싱하기 위한 것인데 Salvo는 자체
  포맷만 다루므로 전부 불필요하다. 하위 패키지 `graphql-language-service`의
  순수 함수를 직접 호출한다(의존성 3개, 2026-08-21 실측 확인).
- **proposed API를 쓰지 않는다.** 실질 차단선은 런타임이다: stable VS Code는
  `product.json` 허용목록(`extensionEnabledApiProposals`, Microsoft 비공개
  빌드 전용)에 없는 확장의 proposed API를 활성화하지 않는다. `vsce`의 publish
  거부는 1차 방어일 뿐 우회 플래그(`--allow-all-proposed-apis`)가 있으므로
  근거로 쓰지 않는다. 어느 쪽이든 결론은 같다: 설계는 stable API로 닫는다.
- **`globalState` / `workspaceState`에 토큰을 넣지 않는다.** 평문이다.
  공식 문서가 명시적으로 경고한다.
- **`retainContextWhenHidden`을 기본으로 켜지 않는다.** d.ts가 "high memory
  overhead"라고 직접 경고한다. 상태 유지는
  `getState/setState` → `WebviewPanelSerializer` → `retainContextWhenHidden`
  순서로 올라간다. 그리고 **숨겨진 webview에는 `postMessage`가 안 간다.**
  (d.ts 10014행과 10072행이 이 지점에서 서로 모순된다. 결정 8의 pull 기반
  설계는 어느 해석에서도 안전하다.)
- **Custom Editor의 `priority`를 `"default"`로 두지 않는다.** `.salvo` 파일이
  항상 GUI로 열려 원문 편집이 막힌 느낌을 준다. `"option"`으로 두고 Reopen
  With로 전환시킨다. "파일이 진실의 원본"이라는 전제와 직결된다.
- **인트로스펙션을 기본 스키마 소스로 삼지 않는다.** 회사 서버는
  `introspection: false`가 환경 분기 없이 하드코딩되어 있다. 기본값은 로컬
  SDL 파일이고, 인트로스펙션은 opt-in이다.
- **사용자에게 프로덕션 인트로스펙션을 켜라고 안내하지 않는다.** OWASP 권고와
  사내 방침에 정면으로 어긋난다.
- **텔레메트리를 넣지 않는다.** 기본 off도 아니고 코드가 아예 없어야 한다.
- **`http.proxy`를 직접 읽어 처리하지 않는다.** `http.proxySupport` 기본값이
  `override`라 VS Code가 전역 `fetch`와 `http`/`https`/`undici`를 이미 패치한다.
  직접 지정한 custom agent는 오히려 무시될 수 있다.
- **공식 문서를 프록시 동작의 근거로 삼지 않는다.** `docs/setup/network`는
  소스보다 뒤처져 있고 "Extensions don't benefit yet from the same proxy
  support"라는 낡은 문장이 남아 있다. 소스를 본다.

## 검증되지 않은 것을 문서에 사실로 쓰지 않는다

`.claude/research.md`의 "미확인 항목"은 확인되기 전까지 계획의 근거로 쓰지
않는다. 특히 다음 셋은 v0.1 착수 판단을 바꾼다.

1. 246KB SDL의 `buildSchema` 실측 시간
2. LSP 서버와 `.salvo` 포맷의 접합 가능성
3. 님 계정의 GraphOS Studio Explorer 접근 권한

## Style

`custom-intellij-nav`의 규칙을 그대로 따른다. 두 레포에서 다른 컨벤션을
쓸 이유가 없다.

- TypeScript strict clean.
- 파일과 폴더는 `kebab-case`. 타입은 `PascalCase`, 값은 `camelCase`,
  모듈 상수는 `SCREAMING_SNAKE_CASE`.
- React 컴포넌트 파일만 `PascalCase.tsx`.
- 임포트는 상대 경로. path alias를 쓰지 않는다. (번들러를 거치면 alias도
  동작하지만, 이 레포는 도구 의존을 줄이는 쪽으로 통일한다. 기술 제약이
  아니라 컨벤션이다.)
- 파일 헤더 JSDoc을 주요 export에 붙인다.
- 인라인 근거 주석은 한국어로 써도 된다. export doc-comment는 영어로 쓴다.
- 파일 이름을 바꿀 때는 `git mv`를 쓴다. macOS APFS는 대소문자를 구분하지
  않아 평범한 `mv`가 변경을 놓친다.

## Build

- **Node 20 이상이 필요하다.** `@vscode/vsce`의 engines가 `>= 20`이고
  (2026-08-21 npm 확인) 전역 `File`은 Node 20부터 있다. 전작에서 Node 18로
  빌드하다 실패한 실측 사례가 있으므로 처음부터 맞춰둔다.
- **push 전에 `gh auth switch -u jungsehui`.** 이 머신의 gh 기본 계정은
  `jungsehui202`(회사)이고, 이 레포 소유자는 `jungsehui`(개인)다.
