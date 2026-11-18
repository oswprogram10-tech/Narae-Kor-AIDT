# 국어나래 AI — 작업 규칙

초등 국어 AI 학습 **모듈**(웹·안드로이드·윈도우 프로그램에 병합). 1인·교사 프로젝트, 연구·대회용. 계획과 결정 사항은 `docs/plan.md`.

## 작업 분담(모델)

- **계획·검수: 메인 세션(Opus).** 요구 분석, 설계, 구현 지시서 작성, 결과 검수(코드 읽기·테스트·실제 실행), 커밋·푸시.
- **구현: `narae-implementer` 서브에이전트(Sonnet, `.claude/agents/narae-implementer.md`).** 메인 세션은 코드 작성이 필요한 작업을 직접 하지 않고 이 에이전트에게 맡긴다. 예외: 한두 줄 수정, 검수 중 발견한 작은 버그 수정, 설정 파일.
- 서브에이전트는 대화 내용을 모르므로 지시서에 다음을 모두 적는다: 목표, 범위(할 것/하지 말 것), 관련 파일 경로, 따라야 할 기존 패턴, 수용 기준(테스트 항목), 검증 명령.
- 서로 독립적인 구현 작업은 서브에이전트 여러 개에 나눠 동시에 맡길 수 있다. 같은 파일을 건드리는 작업은 나누지 않는다.
- 검수 때 서브에이전트의 보고만 믿지 말고 diff를 직접 읽고, 검사를 다시 돌리고, 화면이 있으면 브라우저로 확인한다.

## 구조와 원칙

- `src/core/` 모듈 핵심부: Next.js·Node 내장 모듈·DB·`@/lib`·`@/app` 의존 금지(ESLint가 강제). 학습 모듈 로직은 여기에.
- `src/app/`, `src/lib/` 레퍼런스 호스트(Next.js). 화면·API·DB 어댑터.
- 학생 화면 문구는 초등학생 눈높이의 해요체 한국어. 학생 실명·이메일 저장 금지.
- AI는 학생 글을 대신 써 주지 않는다(코치 정책 `src/core/coach/policy.ts`, 가드레일 `guard.ts`). 새 기능도 이 원칙을 지킨다.
- 성취기준 코드는 `src/core/data/standards.ts`(87개)만 기준으로 쓴다.

## 검증 명령

```bash
npx tsc --noEmit
```

```bash
npx eslint src tests scripts training/gen
```

```bash
npm test
```

```bash
npm run build
```

화면을 바꿨다면 빌드 후 `SESSION_SECRET=… npx next start`로 띄워 브라우저(Playwright)로 확인한다.
