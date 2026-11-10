// 녹음 없이 처리 시간을 어림하려고 만드는 합성 소리(말소리와 비슷한 소리 높낮이·세기 변화). 같은 입력이 항상 같게 나오도록 고정된 규칙으로 만든다.
export function synthSpeechLike(seconds: number, sampleRate = 16000): Float32Array {
  const n = Math.floor(seconds * sampleRate);
  const out = new Float32Array(n);
  let seed = 12345;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff - 0.5;
  };
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const f0 = 120 + 30 * Math.sin(2 * Math.PI * 0.7 * t);
    const syllable = Math.max(0, Math.sin(2 * Math.PI * 4 * t)); // 초당 4음절 정도의 세기 변화
    let v = 0;
    for (let h = 1; h <= 8; h++) v += Math.sin(2 * Math.PI * f0 * h * t) / h;
    out[i] = (0.25 * v * syllable + 0.01 * rnd()) * 0.8;
  }
  return out;
}
