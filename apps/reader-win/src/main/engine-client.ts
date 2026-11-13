// 인식 전용 프로세스(utilityProcess)와 주고받는다. 화면이 멈추지 않게 인식은 모두 이 프로세스 안에서 한다.
import { utilityProcess, type UtilityProcess } from "electron";

import type { TranscribeResult } from "../lib/api";
import type { EngineRequest } from "../engine/core";

interface Pending {
  resolve: (v: never) => void;
  reject: (e: Error) => void;
}

export class EngineClient {
  private child: UtilityProcess | null = null;
  private pending = new Map<number, Pending>();
  private nextId = 1;

  constructor(
    private readonly script: string,
    private readonly config: { modelsDir: string; threads: number },
  ) {}

  private send<T>(msg: Record<string, unknown>): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: never) => void, reject });
      this.child?.postMessage({ id, ...msg });
    });
  }

  private async ensure(): Promise<void> {
    if (this.child) return;
    // 엔진은 로컬 모델 폴더만 읽고 네트워크를 쓰지 않는다(env.allowRemoteModels=false).
    const child = utilityProcess.fork(this.script, [], { serviceName: "narae-engine", stdio: "ignore" });
    this.child = child;
    child.on("message", (m: { id: number; ok: boolean; result?: unknown; error?: string }) => {
      const p = this.pending.get(m.id);
      if (!p) return;
      this.pending.delete(m.id);
      if (m.ok) p.resolve(m.result as never);
      else p.reject(new Error(m.error ?? "인식 중 오류가 났어요."));
    });
    child.on("exit", () => {
      this.child = null;
      for (const p of this.pending.values()) p.reject(new Error("인식 프로세스가 멈췄어요. 다시 시도해 주세요."));
      this.pending.clear();
    });
    await this.send({ op: "init", config: this.config });
  }

  async transcribe(req: EngineRequest): Promise<TranscribeResult> {
    await this.ensure();
    return this.send<TranscribeResult>({ op: "transcribe", req });
  }

  /** 설정(스레드 수 등)이 바뀌었을 때 프로세스를 다시 시작한다 */
  stop(): void {
    this.child?.kill();
    this.child = null;
  }
}
