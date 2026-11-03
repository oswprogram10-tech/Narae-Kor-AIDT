# 호스트 프로그램에 병합하기

국어나래는 다른 프로그램(웹·안드로이드·윈도우)에 병합해 쓰는 **모듈**입니다. 이 문서는 병합하는 쪽(호스트)이 준비할 것을 정리합니다.

## 구성

```
┌──────────── 호스트 프로그램 ────────────┐
│  [학생·교사 화면]  ← 국어나래 화면 모듈   │   웹: 그대로 / 안드로이드: WebView / 윈도우: Electron·Tauri
│        │  (2단계) 내장 초소형 모델 실행기   │   ← 기기 안에서 실행, 학생 글이 밖으로 나가지 않음
│        ▼ HTTP JSON                        │
│  [호스트 서버]                             │
│    - 로그인·학생·학급·저장소(호스트 것)      │
│    - CoachHostAdapter 구현                 │
│    - processCoachTurn() 호출               │
│    - API 키 보관(Claude·Gemini·ChatGPT)     │   ← 키는 서버에만. 학생 기기로 보내지 않음
└───────────────────────────────────────────┘
```

- `src/core/` — 모듈 핵심부. Next.js·Node 내장 모듈·DB에 의존하지 않으며(ESLint로 강제) 어디서나 같은 코드를 씁니다.
- `src/app/`, `src/lib/` — **레퍼런스 호스트**. "호스트가 이렇게 붙이면 된다"는 예시이자 연구용 단독 실행판입니다.

## 호스트 서버가 할 일

### 1. AI 설정 만들기

```ts
import { ProviderRegistry } from "narae/core"; // 저장소의 src/core

const registry = new ProviderRegistry({
  order: ["local", "claude", "gemini", "openai"], // 기본 시도 순서(끝에는 항상 모의 코치)
  claude: { apiKey: process.env.ANTHROPIC_API_KEY }, // 모델 기본값 claude-haiku-5-5
  gemini: { apiKey: process.env.GEMINI_API_KEY, model: process.env.NARAE_GEMINI_MODEL },
  openai: { apiKey: process.env.OPENAI_API_KEY, model: process.env.NARAE_OPENAI_MODEL },
});
```

키나 모델 이름이 없는 AI는 자동으로 건너뜁니다. 아무 AI도 없으면 모의 코치(정해진 질문 은행)가 답합니다.

### 2. `CoachHostAdapter` 구현하기 (`src/core/host/adapter.ts`)

| 함수 | 하는 일 |
| --- | --- |
| `loadCoachTurn(principal, submissionId)` | 호스트 로그인 정보로 권한을 확인하고, 과제·학생 글·대화 기록을 돌려줌. 권한이 없으면 `null` |
| `coachUsageToday(studentKey)` | 오늘 이 학생이 코치를 부른 횟수(비용 관리) |
| `saveCoachTurn(submissionId, record)` | 학생 메시지와 코치 응답(어느 AI가 답했는지, 가드레일 개입 여부 포함)을 저장 |
| `logEvent(...)` (선택) | 연구용 활동 로그 |

예시: `src/lib/coach/adapter.ts`(Drizzle + PostgreSQL/PGlite).

### 3. 요청 처리하기

```ts
const outcome = await processCoachTurn(principal, requestJson, { adapter, registry, dailyLimit: 30 });
return Response.json(outcome.body, { status: outcome.status });
```

예시: `src/app/api/submissions/[id]/coach/route.ts`. 요청·응답 형식은 `CoachTurnResponse` 타입을 따릅니다.

## 지켜야 할 원칙

- **API 키는 호스트 서버에만** 둡니다. 모듈은 학생 기기에서 돌기 때문에 키를 기기에 저장하면 새어 나갈 수 있습니다.
- 어떤 AI가 답하든 같은 대필 금지 정책(`src/core/coach/policy.ts`)과 가드레일(`src/core/coach/guard.ts`)이 적용됩니다. 호스트가 이 단계를 건너뛰지 않도록 `processCoachTurn`(또는 `runCoachEngine`)을 거쳐 호출하세요.
- 학생 실명을 모듈에 넘기지 않습니다. `studentKey`는 호스트의 익명 ID면 충분합니다.

## 다음 단계(2단계): 내장 모델

`src/core/providers/local.ts`의 `LocalModelRuntime` 규약에 맞춘 실행기를 화면 모듈 쪽에 붙입니다(0.5B~1B급 공개 모델, 4비트 압축 약 400~800MB, WebGPU 우선·WASM 대체). 연결 전까지 `local`은 자동으로 건너뜁니다.
