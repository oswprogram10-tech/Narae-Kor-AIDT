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

## 내장 모델(학생 기기에서 실행)

```
학생 기기                                   호스트 서버
 ├─ POST {mode:"prepare"}  ─────────────▶  prepareCoachTurn: 권한 확인, 자료(context) 반환
 ├─ runCoachEngine(context, 내장 모델)       (외부로 나가는 것 없음)
 └─ POST {mode:"record", output, …} ────▶  recordLocalCoachTurn: 입력 분류·형식·가드레일 재검사 후 저장
```

- 서버는 기기에서 온 답을 그대로 믿지 않습니다. 위험 신호·개인 정보는 서버 규칙이 처리하고, 예시 문장이 섞이면 서버가 다시 교체합니다.
- 과제의 코치 AI가 `local`이면 기기가 준비되지 않았을 때도 외부 AI로 보내지 않고 모의 코치가 답합니다(개인정보 보호).
- 모델 파일 배포: `npm run model:fetch -- <id>`로 받은 `public/models/<id>/` 폴더를 모듈과 함께 배포하거나, 호스트가 제공하는 주소를 `NARAE_LOCAL_MODEL_BASE_URL`로 지정합니다. 학생 기기에는 처음 한 번 내려받아 브라우저 캐시에 저장됩니다.
- 안드로이드·윈도우 앱이 네이티브 추론을 쓰려면 `globalThis.__NARAE_LOCAL_PIPELINE_FACTORY__`에 `PipelineFactory`(`src/core/local/runtime.ts`)를 주입하면 됩니다.
