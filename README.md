# 국어나래 AI (Narae-Kor AIDT)

**AI가 대신 써 주지 않는** 초등 국어 학습 모듈. 2022 개정 국어과 성취기준(87개)에 묶인 쓰기·문법·읽기·매체·문학 활동을 학생이 스스로 하도록 질문과 단계별 안내로 돕고, 선생님은 학급 전체의 과정을 실시간으로 봅니다.

- 목적: 1인·교사 프로젝트, 연구·대회·공모전용
- 계획 문서: [docs/plan.md](docs/plan.md)(결정 사항·진행 기록), 단계별 설계·검수 기록: [2단계 문법](docs/stage2-grammar.md) · [3단계 읽기](docs/stage3-reading.md) · [4단계 매체](docs/stage4-media.md) · [5단계 문학](docs/stage5-literature.md)
- **최종 목표: 다른 프로그램(웹·안드로이드·윈도우)에 병합하는 모듈.** 핵심부는 `src/core/`(호스트 무관), 이 저장소의 Next.js 앱은 병합 방법을 보여 주는 레퍼런스 호스트입니다. 병합 방법: [docs/host-integration.md](docs/host-integration.md)

## 모듈과 활동

| 단계 | 모듈 | 활동(성취기준) | 채점·안전 |
| --- | --- | --- | --- |
| 1 | 생각·붓 나래(쓰기) | 4단계 글쓰기 작업대, 글 종류 11가지(문단·보고·의견·편지·설명·주장·감상·매체 + 인물에게 편지·경험을 시로·경험을 이야기로) | 소크라테스 코치(대필 금지), 맞춤법 점검, 루브릭(AI 제안+교사 확정), 교사 코멘트·인물 답장 도우미 |
| 2 | 한글·말본 나래(문법·어휘) | 문장 짜임 블록, 높임 표현, 문장 호응, 낱말 관계, 국어사전, 시간 표현, 맞춤법·띄어쓰기(문제 80개) | 규칙 채점(AI 없음), 찍기 방지(원리→힌트→정답), 보기 순서 섞기 |
| 3 | 책·글 나래(읽기) | 중심 생각, 사실과 의견, 글의 짜임, 문맥 추론, 내 말로 요약하기, 예측하며 읽기, 관점 비교(자체 창작 지문) | 근거 문장 함께 고르기, 요약은 규칙 피드백(내용은 알려 주지 않음) |
| 4 | 미디어 나래(매체) | 출처 탐정단, 검색 실험실, 뉴스·광고 팩트체크, 매체 소통 예절(연습용 가상 페이지), 카드뉴스 만들기, 매체 이용 성찰 일지 | 실제 이름 금지 검사, 고른 검색어의 결과만 전송, 작품 공유는 교사 승인+정해 둔 반응 스티커 |
| 5 | 상상·울림 나래(문학) | 마음 온도계(마음 그래프), 감각적 표현, 인물 관계도, 비유적 표현, 인상적인 부분 나누기(자체 창작 동화·시) | 근거로 확인할 수 있는 것만 채점, 해석은 기록만 |
| 6 | 소리·말 나래(듣기·말하기) | (예정) 토론·면담·발표, 실험: 낭독 유창성, 입모양·자세 | — |

**모든 자유 글**(코치 대화, 요약, 카드뉴스, 한 줄 쓰기, 성찰 등)은 길이 검사보다 먼저 규칙 감지기를 거쳐, 위험 신호·개인 정보가 보이면 저장하지 않거나(개인 정보) 정해진 돌봄 안내와 함께 교사에게 알립니다.

## 코치 AI

| AI | 위치 | 설정 |
| --- | --- | --- |
| 내장 모델 `narae-coach-1b`(기본) | 학생 기기 안 | `NARAE_LOCAL_MODEL=narae-coach-1b` + 모델 파일(`npm run model:fetch -- narae-coach-1b`). 학생 화면의 ‘내장 AI 준비하기’로 기기에 한 번 받음 |
| Claude | 호스트 서버 | `ANTHROPIC_API_KEY` (기본 모델 `claude-haiku-5-5`) |
| Gemini | 호스트 서버 | `GEMINI_API_KEY` + `NARAE_GEMINI_MODEL` |
| ChatGPT | 호스트 서버 | `OPENAI_API_KEY` + `NARAE_OPENAI_MODEL` |
| 모의 코치 | 어디서나 | 설정 없음. 다른 AI가 모두 없거나 실패할 때 답함 |

교사는 과제마다 코치 AI를 고를 수 있고(기본: 자동). ‘내장 모델’을 고른 과제는 학생 글을 외부 AI로 보내지 않습니다. 고른 AI가 실패하면 다음 AI → 모의 코치 순서로 넘어갑니다. 어떤 AI가 답하든 같은 대필 금지 정책(`src/core/coach/policy.ts`)과 가드레일(`src/core/coach/guard.ts`)이 적용됩니다.

## 내장 AI

- **`narae-coach-1b`**: Gemma 3 1B를 안전 중심으로 파인튜닝(SFT→DPO, `training/`)하고 브라우저용으로 압축한 모델(951MB, 동적 int8 + `down_proj`만 GPTQ). **배포 파일 그대로** 레드팀 950문항을 통과(유출 0, 위험 신호→교사 알림 0.993, 개인 정보 1.000). 대필 요청은 과잉 표시가 있어 모델 판단을 쓰지 않고 규칙·가드레일이 막습니다. 기록: [evals/results/2026-11-05-quant/](evals/results/2026-11-05-quant/README.md), 채택 절차: [docs/finetuned-model-adoption.md](docs/finetuned-model-adoption.md)
- 실행: transformers.js(ONNX Runtime Web). WebGPU 파일이 없는 모델은 WASM으로 실행(브라우저 평균 응답 약 39초, 4코어 기준). 웹·안드로이드 WebView·윈도우(Electron/Tauri) 공통
- 흐름: 서버가 자료를 주고(prepare) → 기기 안에서 답을 만들고 → 서버가 다시 검사해 저장(record)
- 호스트 앱이 자체 실행기를 쓰려면 `globalThis.__NARAE_LOCAL_PIPELINE_FACTORY__`로 주입할 수 있습니다.
- **학교 기기 측정**: 교사 화면의 ‘내장 AI 측정’(`/teacher/lab/local-model`)을 학생 기기에서 열면 불러오기 시간, 응답 시간, 형식 성공률을 보여 줍니다.

```bash
npm run model:fetch -- narae-coach-1b
```

브라우저 실행 엔진 파일(`public/ort/`)은 `npm install` 때 자동으로 복사됩니다. 내장 AI 화면에는 교차 출처 격리 헤더가 필요합니다(이 앱은 `next.config.ts`에 설정됨).

## 내 컴퓨터에서 실행하기

Node.js 20 이상이 필요합니다.

```bash
npm install
```

```bash
npm run dev
```

브라우저에서 http://localhost:3000 을 엽니다. 데이터는 `./.data/pglite`에 저장됩니다(별도 DB 설치 불필요). AI 코치를 쓰려면 `.env.example`을 `.env.local`로 복사하고 쓰려는 AI의 키(와 모델 이름)를 넣습니다. 키가 없으면 모의 코치로 동작합니다.

## 무료 티어로 배포하기 (Vercel + Supabase)

1. [Supabase](https://supabase.com)에서 무료 프로젝트를 만들고, 서울 리전(Northeast Asia)을 고릅니다. 학생 글이 국내 리전에 저장되도록 하기 위함입니다.
2. Project Settings → Database에서 연결 문자열(Transaction pooler, 포트 6543)을 복사합니다.
3. [Vercel](https://vercel.com)에서 이 저장소를 가져오고, 환경 변수 `DATABASE_URL`, `SESSION_SECRET`(`openssl rand -hex 32`)와 쓰려는 AI의 키를 넣습니다.
4. 배포하면 첫 요청 때 DB 표가 자동으로 만들어집니다(`drizzle/` 마이그레이션).

비용 관리: 기본 코치 모델은 가장 저렴한 `claude-haiku-5-5`(effort `low`)이고, 학생 1명당 하루 30회로 제한됩니다(`NARAE_COACH_DAILY_LIMIT`).

## 개발

```bash
npm test
```

```bash
npm run typecheck
```

DB 스키마(`src/lib/db/schema.ts`)를 바꾼 뒤에는 마이그레이션을 만듭니다(직접 SQL을 쓰지 않음).

```bash
npm run db:generate
```

## 연구·대회용 평가

- **대필 차단 평가**: `evals/ghostwrite.json`(대필 유도 30건 + 정상 도움 20건)을 AI별로 따로 돌려 거절률, 가드레일 개입률, 과잉 차단률을 비교합니다(다른 AI로 넘어가지 않게 한 AI만 씀). 실제 API 비용이 조금 듭니다.

  ```bash
  npm run eval:coach -- claude
  ```

  `claude` 대신 `gemini`, `openai`, `local`(예: `npm run eval:coach -- local narae-coach-1b`)을 넣으면 됩니다.

- **내장 모델 레드팀(배포 파일 그대로)**: `scripts/redteam-local.ts`로 950문항에 답하게 하고 `training/gen/score.ts`로 앱 전체 경로 채점(CPU 약 70분).

- **수업 데이터**: 과제마다 ‘연구용 CSV’(학생 번호만 담은 익명 데이터, 학생 글 원문은 넣지 않음). 쓰기: 단계·글자 수·도움 요청·대필 요청·가드레일 개입·붙여 넣기·루브릭. 문법·읽기·매체·문학: 문제별 시도 수·첫 시도 정답·힌트 단계·걸린 시간(+근거만 틀림, 틀린 검색어, 요약 반영률 등). 카드뉴스 등: 단계·점검 경고·고쳐 쓴 횟수·받은 반응.
- 학생 데이터를 연구에 쓰기 전에 학교장 승인과 보호자 안내·동의를 받아 두세요.

## 개인정보

- 학생은 실명·이메일 없이 번호와 별명으로만 등록됩니다. 번호-이름 대응표는 선생님이 앱 밖에서 보관합니다.
- AI 코치에는 과제와 학생 글만 보내고, 별명·번호는 보내지 않습니다. 외부 AI의 API 키는 서버에만 둡니다.
- 그림 비밀번호는 해시로만 저장하며, 5번 틀리면 5분간 잠깁니다. 선생님이 초기화할 수 있습니다.

## 성취기준 데이터

`src/core/data/standards.ts`에 2022 개정 국어과 초등 성취기준 87개(1~2학년 23, 3~4학년 30, 5~6학년 34)가 있습니다. 고시 원문을 옮긴 두 자료를 대조해 만들었으며, 연구 제출 전 국가교육과정정보센터(NCIC) 원문과 최종 대조하기를 권합니다.

## 구조

```
src/
  core/          ★ 모듈 핵심부(호스트 무관, ESLint가 Next·Node·DB 의존을 막음)
    coach/       코치 정책, 가드레일·규칙 감지기, 모의 코치, 엔진(AI 대체 순서)
    providers/   AI 공통 연결부: 내장 모델·Claude·Gemini·ChatGPT
    local/       내장 모델 카탈로그·실행기(transformers.js)
    host/        호스트 서버 연결 지점(CoachHostAdapter, processCoachTurn)
    practice/    찍기 방지 단계, 보기 순서 섞기(모듈 공통)
    grammar/     2단계 문법 문제·채점
    reading/     3단계 읽기 지문·문제·채점·요약 점검
    media/       4단계 가상 페이지·검색 실험실
    cardnews/ diary/ impression/ artifact/   학생 제작물(카드뉴스·성찰 일지·인상 나누기)과 공통 저장·안전 점검
    literature/  5단계 작품·문제·인물 답장 문장 조각
    data/        성취기준 87개, 글쓰기 템플릿(글 종류·고쳐 쓰기 렌즈)
  lib/           레퍼런스 호스트 서버: 로그인, DB(Drizzle), 모듈별 기록·대시보드·CSV
  app/           교사·학생 화면과 API
drizzle/         DB 마이그레이션
evals/           평가셋·평가 기록
training/        내장 모델 파인튜닝·변환(Colab/Kaggle 노트북)
tests/           단위·통합 테스트(vitest)
```
