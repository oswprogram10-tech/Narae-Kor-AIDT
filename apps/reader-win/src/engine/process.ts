// utilityProcess 진입점: main이 보낸 요청을 core 엔진으로 처리한다. 소리를 로그에 남기지 않는다.
import { createEngine, type Engine, type EngineRequest } from "./core";

interface Msg {
  id: number;
  op: "init" | "transcribe" | "dispose";
  config?: { modelsDir: string; threads: number };
  req?: EngineRequest;
}

const port = (process as unknown as { parentPort: { on(e: "message", cb: (ev: { data: Msg }) => void): void; postMessage(m: unknown): void } }).parentPort;
let engine: Engine | null = null;

port.on("message", async ({ data }) => {
  try {
    if (data.op === "init" && data.config) {
      await engine?.dispose();
      engine = createEngine(data.config);
      port.postMessage({ id: data.id, ok: true, result: null });
    } else if (data.op === "transcribe" && data.req && engine) {
      const result = await engine.transcribe(data.req);
      port.postMessage({ id: data.id, ok: true, result });
    } else if (data.op === "dispose") {
      await engine?.dispose();
      port.postMessage({ id: data.id, ok: true, result: null });
    } else {
      port.postMessage({ id: data.id, ok: false, error: "알 수 없는 요청이에요." });
    }
  } catch (e) {
    port.postMessage({ id: data.id, ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});
