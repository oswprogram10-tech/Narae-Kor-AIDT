"""학습한 모델(ONNX)과 레드팀 결과를 Hugging Face에 올린다.

노트북 커널 안에서 import하면 앞 단계 pip 설치로 바뀐 패키지와 섞여 오류가 날 수 있어서,
별도 프로세스로 실행한다. 토큰은 환경 변수 HF_TOKEN으로 받는다.

    HF_TOKEN=... python upload_hf.py --repo 내아이디/narae-coach-gemma3-1b
    HF_TOKEN=... python upload_hf.py --repo 내아이디/narae-coach-gemma3-1b --results-only   # 시험 결과만(불합격 분석용)
    HF_TOKEN=... python upload_hf.py --repo 내아이디/narae-coach-gemma3-1b --results-only --names sft   # 일부 단계만
"""

import argparse
import glob
import os
import sys


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True)
    ap.add_argument("--folder", default="export/narae-gemma-1b")
    ap.add_argument("--private", action="store_true")
    ap.add_argument("--message", default="국어나래 코치 모델(ONNX int8)", help="모델 폴더를 올릴 때의 커밋 메시지")
    ap.add_argument("--results-only", action="store_true", help="모델 없이 안전 시험 결과·학습 기록만 올림")
    ap.add_argument("--names", default="base,sft,dpo", help="올릴 시험 결과 단계(쉼표로 구분). 기본: base,sft,dpo")
    args = ap.parse_args()
    names = [n.strip() for n in args.names.split(",") if n.strip()]

    token = os.environ.get("HF_TOKEN", "").strip()
    if not token:
        sys.exit("HF_TOKEN이 비어 있어요. Hugging Face 토큰(Write 권한)을 넣어 주세요.")
    if not args.results_only and not os.path.isdir(os.path.join(args.folder, "onnx")):
        sys.exit(f"{args.folder}/onnx 가 없어요. 6단계(ONNX 내보내기)를 먼저 실행해 주세요.")

    try:
        from huggingface_hub import HfApi
    except Exception as e:  # noqa: BLE001
        sys.exit(f"huggingface_hub를 불러오지 못했어요: {e}\n'!pip install -U huggingface_hub' 후 다시 실행해 주세요.")

    api = HfApi(token=token)
    try:
        who = api.whoami()
    except Exception as e:  # noqa: BLE001
        sys.exit(f"토큰이 올바르지 않아요: {e}")
    print("로그인:", who.get("name"))

    # 이미 있는 저장소는 공개 여부를 바꾸지 않는다(private 값은 새로 만들 때만 쓰인다).
    api.create_repo(args.repo, private=args.private, exist_ok=True)
    print("저장소:", f"https://huggingface.co/{args.repo}")
    if not args.results_only:
        api.upload_folder(repo_id=args.repo, folder_path=args.folder, commit_message=args.message)
    # 시험 결과도 함께 올린다(앱과 같은 코드로 다시 채점하기 위해)
    for name in names:
        for fname in ["redteam_outputs.jsonl", "redteam_outputs.jsonl.score.json"]:
            p = f"runs/{name}/{fname}"
            if os.path.exists(p):
                api.upload_file(path_or_fileobj=p, path_in_repo=f"redteam/{name}_{fname}", repo_id=args.repo)
            else:
                print(name, "결과 없음:", p)
        # 학습 기록(손실 곡선)도 함께: 마지막 체크포인트의 trainer_state.json
        states = sorted(glob.glob(f"runs/{name}/checkpoint-*/trainer_state.json"), key=lambda x: int(x.split("checkpoint-")[1].split("/")[0]))
        if states:
            api.upload_file(path_or_fileobj=states[-1], path_in_repo=f"redteam/{name}_trainer_state.json", repo_id=args.repo)
    print("완료:", f"https://huggingface.co/{args.repo}")


if __name__ == "__main__":
    main()
