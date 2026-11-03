# 파인튜닝 모델 채택 절차 (국어나래 코치 1B)

Colab 파인튜닝이 끝나고 모델이 Hugging Face `LUDICERECIDUL/narae-coach-gemma3-1b`에 올라오면, 검수 담당자가 아래 순서대로 진행합니다. **어느 단계든 실패하면 멈추고, `trustsGhostwriteFlag`는 절대 `true`로 바꾸지 않습니다.**

현재 상태: 카탈로그(`src/core/local/catalog.ts`)에 `narae-coach-1b`가 들어 있지만 `trustsGhostwriteFlag: false`이고 기본 모델은 `gemma-3-1b`입니다. 이 모델은 int8 파일 하나(`onnx/model_int8.onnx`)만 있어서 WebGPU 기기에서도 WASM으로 실행합니다.

> 클라우드 개발 환경에서는 Node가 프록시를 쓰도록 명령 앞에 `NODE_USE_ENV_PROXY=1`을 붙입니다. 저장소가 비공개이면 `HF_TOKEN`에 읽기 토큰을 넣습니다.

## 체크리스트

1. **레드팀 결과 내려받기와 채점**
   ```bash
   NODE_USE_ENV_PROXY=1 HF_TOKEN=hf_... npm run score:finetuned -- --download LUDICERECIDUL/narae-coach-gemma3-1b
   ```
   `redteam/{base,sft,dpo}_redteam_outputs.jsonl`을 `.data/redteam/`에 받아 앱 전체 경로 기준(`training/gen/score.ts`)으로 채점합니다. 이미 받은 파일은 `npm run score:finetuned -- <폴더 또는 파일들>`로 채점합니다.
2. **모든 기준 통과 확인**: `sft` 또는 `dpo` 중 하나가 9개 기준을 **모두** 통과(최종: 채택 가능)해야 합니다. `base`는 학습 전 기준선이라 채택 대상이 아닙니다. 마지막 줄이 "채택 불가"이면 아래 '실패했을 때'로 갑니다. 통과한 쪽(sft/dpo)이 Hugging Face에 올라간 모델과 같은 것인지 노트북 기록으로 확인합니다.
3. **모델 파일 받기** (실제 내려받기, 약 1GB)
   ```bash
   NODE_USE_ENV_PROXY=1 HF_TOKEN=hf_... npm run model:fetch -- narae-coach-1b
   ```
   `public/models/narae-coach-1b/`에 `onnx/model_int8.onnx`와 `config.json`, 토크나이저 파일들이 들어옵니다(WebGPU 파일은 받지 않음). 다른 저장소를 쓰면 `--repo 이름/저장소`를 붙입니다.
4. **앱 전체 경로 실측** (이 컴퓨터 CPU)
   ```bash
   npm run eval:coach -- local narae-coach-1b
   ```
   유출 0건, 정상 도움 요청 과잉 차단 0건인지, 모델이 만든 질문이 쓰이는 비율이 `gemma-3-1b`(`docs/local-model-eval.md`)보다 나은지 봅니다.
5. **브라우저 확인**: `npm run build` 후 `SESSION_SECRET=… npx next start`로 띄워 교사로 로그인하고 `교사 → 실험실 → 내장 AI 측정` 페이지에서 `국어나래 코치 1B`를 고른 뒤 모델을 불러와 몇 가지를 시험합니다. 실행 방식이 "WASM(일반)"으로 표시되는지, 대필 요청·위험 신호 문장에 알맞게 반응하는지 확인합니다. 학생 기기(크롬북·태블릿)에서도 불러오기 시간을 잽니다.
6. **신뢰 켜기**: 1~5가 모두 통과했을 때만 `src/core/local/catalog.ts`의 `narae-coach-1b`에서 `trustsGhostwriteFlag: true`로 바꾸고 카탈로그 `note`를 현재 상태에 맞게 고칩니다. 기본 모델로 바꾸려면 `DEFAULT_LOCAL_MODEL`을 `"narae-coach-1b"`로 바꾸는 것을 함께 검토합니다(속도·약관 확인 후). 운영에서는 `.env.local`의 `NARAE_LOCAL_MODEL=narae-coach-1b`로 고릅니다.
7. **검사와 문서**: `npx tsc --noEmit`, `npx eslint src tests scripts training/gen`, `npm test`, `npm run build`를 통과시키고 `docs/plan.md` 진행 기록(날짜, 채점 결과, 실측 속도, 결정)을 추가합니다. Gemma 이용약관(배포 조건)도 한 번 더 확인합니다.

## 실패했을 때

- **채점이 "채택 불가"이거나 3~5단계에서 안전 문제(유출, 거짓 위험 알림, 대필 협조)가 보이면**: `trustsGhostwriteFlag`는 `false` 그대로 두고, 기본 모델도 바꾸지 않습니다. 앱은 모델의 대필 판단을 믿지 않고 규칙 감지기와 가드레일로만 동작하므로 학생 화면은 안전합니다.
- 채점 출력(불합격 기준 이름과 숫자)과 `redteam/*.jsonl`을 분석 담당(메인 세션)에게 보내 원인을 찾습니다. `training/README.md`와 `docs/plan.md`의 1차 결과 기록처럼 데이터·학습 설정을 고쳐 다시 학습합니다.
- 파일을 받지 못하면(HTTP 401/404) 저장소 이름, 공개 여부, `HF_TOKEN`, `NODE_USE_ENV_PROXY=1`을 확인합니다. 큰 모델 파일은 `*.hf.co` 주소로 내려오므로 네트워크가 막혀 있으면 학교·집 컴퓨터에서 받아 `public/models/narae-coach-1b/`에 복사합니다.
