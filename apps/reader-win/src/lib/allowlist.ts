// 네트워크·권한·이동 허용 목록 판정(순수 함수). Electron 연결은 src/main/security.ts.
import type { ReaderSettings } from "./settings";

/** 앱 안 화면을 서비스하는 자체 프로토콜 */
export const APP_SCHEME = "narae-app";
export const APP_ORIGIN = `${APP_SCHEME}://app`;

export interface AllowConfig {
  /** 웹 서버 출처(없으면 빈 문자열) */
  serverOrigin: string;
  /** 모델 서버 출처들(modelBaseUrl + 넘김 출처) */
  modelOrigins: string[];
}

// 주의: Node의 URL은 자체 프로토콜(narae-app:)의 origin을 "null"로 돌려주므로, 앱 주소는 프로토콜과 호스트로 비교한다.
function isAppUrl(u: URL): boolean {
  return u.protocol === `${APP_SCHEME}:` && u.host === "app";
}

export function allowConfigFromSettings(s: ReaderSettings): AllowConfig {
  const origins = new Set<string>();
  if (s.modelBaseUrl) origins.add(new URL(s.modelBaseUrl).origin);
  for (const o of s.modelRedirectOrigins) origins.add(o);
  return { serverOrigin: s.serverUrl ? new URL(s.serverUrl).origin : "", modelOrigins: [...origins] };
}

/** 네트워크 요청을 보내도 되는 주소인가: 자체 프로토콜, 값 안에 든 데이터(data:, blob:), 개발 도구, 웹 서버·모델 서버 출처만. */
export function isRequestAllowed(rawUrl: string, cfg: AllowConfig): boolean {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return false;
  }
  switch (u.protocol) {
    case `${APP_SCHEME}:`:
      return isAppUrl(u);
    case "data:":
    case "blob:": // blob:는 우리 화면이 만든 것만 존재한다(출처가 같아야 불러져요)
    case "devtools:":
      return true;
    case "https:":
    case "http:": {
      if (u.protocol === "http:" && !(u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "[::1]")) return false;
      if (cfg.serverOrigin && u.origin === cfg.serverOrigin) return true;
      return cfg.modelOrigins.includes(u.origin);
    }
    default:
      return false;
  }
}

/** 마이크('media') 권한: 앱 자체 화면과 설정한 웹 서버 출처에만. 모델 서버는 안 된다. */
export function isPermissionAllowed(permission: string, requestingUrl: string, cfg: AllowConfig): boolean {
  if (permission !== "media") return false;
  let u: URL;
  try {
    u = new URL(requestingUrl);
  } catch {
    return false;
  }
  if (isAppUrl(u)) return true;
  return !!cfg.serverOrigin && u.origin === cfg.serverOrigin;
}

/** 창이 이동해도 되는 주소: 앱 자체 화면과 웹 서버 출처만. */
export function isNavigationAllowed(rawUrl: string, cfg: AllowConfig): boolean {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return false;
  }
  if (isAppUrl(u)) return true;
  return !!cfg.serverOrigin && u.origin === cfg.serverOrigin;
}
