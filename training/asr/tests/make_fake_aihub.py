"""AI Hub 「한국어 아동 음성 데이터」 모양의 '가짜' 데이터를 만든다(도구 시험 전용).

    python tests/make_fake_aihub.py /tmp/fake-aihub

진짜 데이터가 아니에요. 음성은 사인파이고 전사는 지어낸 문장이며, SpeakerName 칸에는 '가짜이름' 이 든 이름을 넣어
도구가 이름을 새어 나가게 하지 않는지 시험할 수 있게 했어요.

만드는 것(루트 아래)
  labels/Training/02.라벨링데이터/TL_01.zip       라벨 JSON(zip 안 한글 경로는 cp949, 플래그 없음 → 이름 풀기 시험)
  labels/Validation/02.라벨링데이터/VL_01.zip     라벨 JSON(utf-8 플래그)
  source/Training/01.원천데이터/TS_01.zip.part0,1  분할 압축(이어 붙이기 시험)
  source/Validation/01.원천데이터/VS_01.zip       48kHz mono 16bit wav
"""
from __future__ import annotations

import io
import json
import sys
import zipfile
from pathlib import Path

import numpy as np
import soundfile as sf

FAKE_MARK = "가짜이름"  # 가짜 SpeakerName 에 들어 있는 문자열(새어 나가면 시험이 실패)
FAKE_REGION = "가짜지역"

SENTENCES = [
    "나는 오늘 학교에 갔어요",
    "(3)/(세) 개를 샀어요",
    "b/ 안녕하세요 n/",
    "토끼가 숲에서 놀았어요",
    "비가 오면 우산을 써요",
    "+그 친구는 (웃음) 달리기를 잘해요",
    "할 수 있다고 말했어요.",
    "우리 가족은 공원에 갔어요",
]


class Cp949Info(zipfile.ZipInfo):
    """utf-8 플래그(0x800) 없이 cp949 로 이름을 쓰는 항목(옛 윈도우 압축 프로그램처럼)."""

    def _encodeFilenameFlags(self):  # noqa: N802
        return self.filename.encode("cp949"), self.flag_bits & ~0x800


def wav_bytes(freq: float, seconds: float, noisy: bool, sr: int = 48000) -> bytes:
    t = np.arange(int(sr * seconds)) / sr
    x = 0.3 * np.sin(2 * np.pi * freq * t)
    if noisy:
        x = x + 0.05 * np.random.RandomState(int(freq)).randn(len(t))
    buf = io.BytesIO()
    sf.write(buf, x.astype("float32"), sr, subtype="PCM_16", format="WAV")
    return buf.getvalue()


def label_json(name: str, text: str, grade_text: str, age: int, category: str, noisy: bool, fname: str, secs: float, code: str) -> dict:
    return {
        # 실제 데이터처럼 NumberOfSpeaker 칸이 화자 번호(숫자 4자리)예요.
        "Basic": {"Language": "ko", "DataCategory": category, "NumberOfSpeaker": f"{int(code[3:]) % 10000:04d}"},
        "Wav": {"SamplingRate": "48000", "BitRate": "16"},
        "Transcription": {"LableText": text, "ErrorTagged": "N", "GrammaticalError": "N"},
        "Speaker": {"SpeakerName": name, "Gender": "여" if int(code[-1]) % 2 else "남", "Age": str(age), "AgeGroup": "어린이", "SchoolYear": grade_text, "Region": FAKE_REGION, "Dialect": "표준어"},
        "Environment": {"RecordingEnviron": "조용한 실내", "NoiseEnviron": "소음 있음" if noisy else "조용함", "RecordingDevices": "스마트폰"},
        "File": {"FileCategory": "wav", "FileName": fname, "DirectoryPath": "x", "FileLength": round(secs, 3)},
        "Miscellaneous_Info": {"SpeechStart": 0.1, "SpeechEnd": round(secs - 0.1, 3)},
    }


def make_fake(root: Path) -> dict:
    root = Path(root)
    info = {"names": [], "train_speakers": [], "valid_speakers": []}

    def build(prefix: str, speakers: list[tuple[str, str, int]], per: int, label_zip: Path, wav_zip: Path, cp949: bool, extra: bool) -> None:
        label_zip.parent.mkdir(parents=True, exist_ok=True)
        wav_zip.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(label_zip, "w") as lz, zipfile.ZipFile(wav_zip, "w") as wz:
            k = 0
            for code, grade_text, age in speakers:
                name = f"김{FAKE_MARK}{code}"
                info["names"].append(name)
                for j in range(per):
                    k += 1
                    secs = 1.0 + (k % 4) * 0.5
                    noisy = k % 5 == 0
                    text = SENTENCES[k % len(SENTENCES)]
                    category = "정형"
                    if extra and code == "SPK001" and j == 0:
                        category = "비정형"
                    if extra and code == "SPK002" and j == 0:
                        text = "알아듣기 *어려운 말"
                    stem = f"{code}_G{grade_text[-3] if grade_text[-3].isdigit() else 'M'}_{j:04d}"
                    d = f"{prefix}/{grade_text.replace(' ', '_')}/{code}"
                    doc = label_json(name, text, grade_text, age, category, noisy, stem + ".wav", secs, code)
                    data = json.dumps(doc, ensure_ascii=False).encode("utf-8")
                    member = f"{d}/{stem}.json"
                    if cp949:
                        zi = Cp949Info(member)
                        zi.compress_type = zipfile.ZIP_DEFLATED
                        lz.writestr(zi, data)
                    else:
                        lz.writestr(member, data)
                    wz.writestr(f"{d}/{stem}.wav", wav_bytes(200 + 20 * (k % 20), secs, noisy))

    train_sp = [(f"SPK{i + 1:03d}", f"초등 {i // 2 + 1}학년", 7 + i // 2) for i in range(12)] + [("SPK013", "중학교 1학년", 14)]
    valid_sp = [(f"SPK{101 + i}", f"초등 {i + 1}학년", 7 + i) for i in range(6)]
    info["train_speakers"] = [c for c, _, _ in train_sp]
    info["valid_speakers"] = [c for c, _, _ in valid_sp]

    tl = root / "labels" / "Training" / "02.라벨링데이터" / "TL_01.zip"
    ts = root / "source" / "Training" / "01.원천데이터" / "TS_01.zip"
    build("TL_01", train_sp, 6, tl, ts, cp949=True, extra=True)
    vl = root / "labels" / "Validation" / "02.라벨링데이터" / "VL_01.zip"
    vs = root / "source" / "Validation" / "01.원천데이터" / "VS_01.zip"
    build("VL_01", valid_sp, 4, vl, vs, cp949=False, extra=False)

    # TS_01.zip 을 둘로 쪼갠다(AI Hub 분할 압축처럼)
    raw = ts.read_bytes()
    half = len(raw) // 2
    (ts.parent / "TS_01.zip.part0").write_bytes(raw[:half])
    (ts.parent / "TS_01.zip.part1").write_bytes(raw[half:])
    info["ts_zip_size"] = len(raw)
    ts.unlink()
    return info


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("사용: python tests/make_fake_aihub.py <빈 폴더>")
    r = make_fake(Path(sys.argv[1]))
    print("가짜 데이터를 만들었어요:", sys.argv[1], "(가짜 이름", len(r["names"]), "개)")
