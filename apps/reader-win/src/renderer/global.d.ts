import type { NaraeSpeechApi } from "../lib/api";

declare global {
  interface Window {
    naraeSpeech: NaraeSpeechApi;
  }
}
export {};
