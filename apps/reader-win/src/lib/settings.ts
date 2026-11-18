// userData/settings.json 읽기. 기본값은 모두 비어 있다(해외 주소를 기본으로 넣지 않는다).
export interface ReaderSettings {
  /** 국어나래 웹 서버 주소(예: https://narae.example.kr). 비면 앱 안 '속도 시험' 화면만 쓴다 */
  serverUrl: string;
  /** 모델 파일을 내려받는 서버 주소(예: https://models.school.kr/asr/). 비면 설치 불가 */
  modelBaseUrl: string;
  /** 모델 서버가 파일을 다른 주소로 넘길 때(HF의 CDN 등) 함께 허용할 출처 */
  modelRedirectOrigins: string[];
  /** 시험 모드: manifest.json이 없는 공개 모델을 sha256 확인 없이 받는다(시험용) */
  trialMode: boolean;
  /** 시험 모드에서 모델 id마다 modelBaseUrl 아래 폴더(예: {"narae-asr-lite": "whisper-base/resolve/main/"}) */
  trialModelPaths: Record<string, string>;
  /** 인식 CPU 스레드 수. null이면 물리 코어 어림 */
  cpuThreads: number | null;
}

export const DEFAULT_SETTINGS: ReaderSettings = {
  serverUrl: "",
  modelBaseUrl: "",
  modelRedirectOrigins: [],
  trialMode: false,
  trialModelPaths: {},
  cpuThreads: null,
};

function isLoopback(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

/** 허용할 수 있는 출처로 바꾼다. https, 또는 같은 기기(localhost)의 http만. 아니면 null */
export function normalizeOrigin(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  let u: URL;
  try {
    u = new URL(value.trim());
  } catch {
    return null;
  }
  if (u.protocol === "https:" || (u.protocol === "http:" && isLoopback(u.hostname))) return u.origin;
  return null;
}

/** 끝에 /가 있는 주소(쿼리·해시 제거). 허용할 수 없으면 null */
export function normalizeBaseUrl(value: unknown): string | null {
  const origin = normalizeOrigin(value);
  if (!origin) return null;
  const u = new URL((value as string).trim());
  u.search = "";
  u.hash = "";
  return u.href.endsWith("/") ? u.href : `${u.href}/`;
}

function safeRelPath(p: string): boolean {
  return !!p && !p.startsWith("/") && !p.includes("\\") && !p.split("/").some((s) => s === "..");
}

export interface ParsedSettings {
  settings: ReaderSettings;
  warnings: string[];
}

/** settings.json의 내용(이미 JSON.parse한 값)을 검사해 설정으로 바꾼다. 잘못된 값은 버리고 알려 준다. */
export function parseSettings(raw: unknown): ParsedSettings {
  const warnings: string[] = [];
  const s: ReaderSettings = { ...DEFAULT_SETTINGS, modelRedirectOrigins: [], trialModelPaths: {} };
  if (raw === null || raw === undefined) return { settings: s, warnings };
  if (typeof raw !== "object" || Array.isArray(raw)) return { settings: s, warnings: ["settings.json 모양이 맞지 않아서 기본값을 써요."] };
  const r = raw as Record<string, unknown>;

  if (r.serverUrl !== undefined && r.serverUrl !== "") {
    const v = normalizeBaseUrl(r.serverUrl);
    if (v) s.serverUrl = v;
    else warnings.push("serverUrl은 https 주소(또는 이 컴퓨터의 http://localhost)만 쓸 수 있어요.");
  }
  if (r.modelBaseUrl !== undefined && r.modelBaseUrl !== "") {
    const v = normalizeBaseUrl(r.modelBaseUrl);
    if (v) s.modelBaseUrl = v;
    else warnings.push("modelBaseUrl은 https 주소(또는 이 컴퓨터의 http://localhost)만 쓸 수 있어요.");
  }
  if (Array.isArray(r.modelRedirectOrigins)) {
    for (const o of r.modelRedirectOrigins) {
      const v = normalizeOrigin(o);
      if (v) s.modelRedirectOrigins.push(v);
      else warnings.push(`modelRedirectOrigins의 "${String(o)}"는 쓸 수 없는 주소라서 뺐어요.`);
    }
  }
  if (r.trialMode === true) s.trialMode = true;
  if (r.trialModelPaths && typeof r.trialModelPaths === "object" && !Array.isArray(r.trialModelPaths)) {
    for (const [k, v] of Object.entries(r.trialModelPaths as Record<string, unknown>)) {
      if (typeof v === "string" && safeRelPath(v)) s.trialModelPaths[k] = v.endsWith("/") ? v : `${v}/`;
      else warnings.push(`trialModelPaths의 "${k}" 값이 맞지 않아서 뺐어요.`);
    }
  }
  if (r.cpuThreads !== undefined && r.cpuThreads !== null) {
    const n = Number(r.cpuThreads);
    if (Number.isInteger(n) && n >= 1 && n <= 64) s.cpuThreads = n;
    else warnings.push("cpuThreads는 1~64 사이 정수여야 해요.");
  }
  return { settings: s, warnings };
}

/** settings.json 문자열을 읽는다. 깨진 JSON이면 기본값과 안내. */
export function parseSettingsText(text: string | null): ParsedSettings {
  if (text === null || !text.trim()) return parseSettings(null);
  try {
    return parseSettings(JSON.parse(text));
  } catch {
    return { settings: parseSettings(null).settings, warnings: ["settings.json을 읽지 못해서 기본값을 써요(JSON 모양을 확인해 주세요)."] };
  }
}
