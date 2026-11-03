"""학습한 모델(ONNX)과 레드팀 결과를 Hugging Face에 올린다.

노트북 커널 안에서 import하면 앞 단계 pip 설치로 바뀐 패키지와 섞여 오류가 날 수 있어서,
별도 프로세스로 실행한다. 토큰은 환경 변수 HF_TOKEN으로 받는다.

    HF_TOKEN=... python upload_hf.py --repo 내아이디/narae-coach-gemma3-1b
"""

import argparse
import os
import sys


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True)
    ap.add_argument("--folder", default="export/narae-gemma-1b")
    ap.add_argument("--private", action="store_true")
    args = ap.parse_args()

    token = os.environ.get("HF_TOKEN", "").strip()
    if not token:
        sys.exit("HF_TOKEN이 비어 있어요. Hugging Face 토큰(Write 권한)을 넣어 주세요.")
    if not os.path.isdir(os.path.join(args.folder, "onnx")):
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

    api.create_repo(args.repo, private=args.private, exist_ok=True)
    api.upload_folder(repo_id=args.repo, folder_path=args.folder, commit_message="국어나래 코치 모델(ONNX int8)")
    # 시험 결과도 함께 올린다(앱과 같은 코드로 다시 채점하기 위해)
    for name in ["base", "sft", "dpo"]:
        for fname in ["redteam_outputs.jsonl", "redteam_outputs.jsonl.score.json"]:
            p = f"runs/{name}/{fname}"
            if os.path.exists(p):
                api.upload_file(path_or_fileobj=p, path_in_repo=f"redteam/{name}_{fname}", repo_id=args.repo)
            else:
                print(name, "결과 없음:", p)
    print("완료:", f"https://huggingface.co/{args.repo}")


if __name__ == "__main__":
    main()
