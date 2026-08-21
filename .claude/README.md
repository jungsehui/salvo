# `.claude/`: AI session context

이 폴더는 Salvo 레포에서 도는 모든 Claude Code 세션의 운영 매뉴얼이다.
git에 추적되므로 세션과 머신을 넘어 컨텍스트가 살아남는다.

## Layout

```
.claude/
├── README.md         # 이 파일
├── research.md       # 1단계 조사 결과. 차별점의 근거이자 이 프로젝트의 존재 이유
├── architecture.md   # 모듈 경계, 7개 설계 결정과 각각의 근거
├── conventions.md    # DO / DON'T, 코드 스타일, 빌드 주의사항
├── roadmap.md        # v0.1 ~ v1.0 마일스톤, 만들지 않을 것, 위험 요소
└── handoff/          # YYYY-MM-DD-*.md 세션 핸드오프 (최신 = 현재 상태)
```

루트 `CLAUDE.md`가 자동 로드되는 진입점이며 이 폴더를 가리킨다.
`CLAUDE.md`는 짧게 유지한다(60줄 미만). 상세는 여기 둔다.

## 새 세션의 읽기 순서

1. `CLAUDE.md` (루트): 30초 개요
2. `.claude/handoff/`: 최신 날짜 파일이 현재 상태
3. `.claude/roadmap.md`: 지금 어느 마일스톤인지, 무엇이 범위 밖인지
4. `.claude/architecture.md`: 코드를 건드릴 때만
5. `.claude/conventions.md`: 새 코드를 쓰기 전에
6. `.claude/research.md`: "왜 이렇게 하나"가 궁금할 때, 또는 차별점을
   재검토할 때

## 편집 규칙

- **research.md**: 새 사실을 확인했을 때만 고친다. 추측을 추가하지 않는다.
  "미확인" 항목이 확인되면 그 자리에서 근거와 함께 갱신한다.
- **architecture / conventions**: 패턴이 바뀔 때 고친다.
- **roadmap**: 마일스톤이 끝나거나 범위가 바뀔 때 고친다. 예상 시간과 실제
  시간이 크게 갈리면 그 사실을 남긴다. 다음 추산이 정확해진다.
- **handoff**: 기존 파일을 절대 수정하지 않는다. 세션이 끝나면 새 날짜 파일을
  쓴다.
- **CLAUDE.md (루트)**: 최소로 유지한다. 새 사실은 상세 파일로 가고
  `CLAUDE.md`는 그것을 가리키기만 한다.
