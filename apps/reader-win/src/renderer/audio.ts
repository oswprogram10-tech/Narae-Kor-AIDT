// 소리를 16kHz 모노 Float32Array로 바꾸는 도구(메모리 안에서만). 파일·네트워크에 쓰지 않는다.
export const TARGET_RATE = 16000;

/** 압축된/원본 소리 바이트(wav, 녹음 결과 등)를 16kHz 모노로. */
export async function decodeTo16k(bytes: ArrayBuffer): Promise<Float32Array> {
  const ctx = new AudioContext();
  try {
    const decoded = await ctx.decodeAudioData(bytes.slice(0));
    const frames = Math.max(1, Math.ceil(decoded.duration * TARGET_RATE));
    const off = new OfflineAudioContext(1, frames, TARGET_RATE);
    const src = off.createBufferSource();
    src.buffer = decoded;
    src.connect(off.destination); // 채널 수가 많으면 자동으로 모노로 섞여요
    src.start();
    const rendered = await off.startRendering();
    return rendered.getChannelData(0).slice();
  } finally {
    void ctx.close();
  }
}

export interface Recorder {
  stop(): Promise<Float32Array>;
}

/** 마이크 녹음을 시작한다. stop()을 부르면 16kHz 소리를 돌려주고 마이크를 끈다. */
export async function startRecording(maxSeconds: number, onAutoStop: () => void): Promise<Recorder> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false });
  const rec = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  const finished = new Promise<void>((resolve) => {
    rec.onstop = () => resolve();
  });
  rec.start();
  const timer = setTimeout(() => {
    if (rec.state !== "inactive") {
      rec.stop();
      onAutoStop();
    }
  }, maxSeconds * 1000);
  return {
    async stop() {
      clearTimeout(timer);
      if (rec.state !== "inactive") rec.stop();
      await finished;
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunks, { type: rec.mimeType });
      chunks.length = 0;
      return decodeTo16k(await blob.arrayBuffer());
    },
  };
}
