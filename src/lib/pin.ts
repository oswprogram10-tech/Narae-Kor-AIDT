// 학생용 그림 비밀번호: 9개 그림 중 4개를 순서대로 고른다(중복 가능, 9^4 = 6,561가지).
// 글자를 아직 빠르게 못 치는 학생도 쓸 수 있고, 저장은 해시로만 한다.

export const PIN_ICONS = ["🐶", "🐱", "🐰", "🐻", "🐼", "🦊", "🐸", "🐧", "🦁"] as const;
export const PIN_LENGTH = 4;

export function isValidPin(pin: string): boolean {
  const parts = pin.split(",");
  return (
    parts.length === PIN_LENGTH &&
    parts.every((p) => /^\d$/.test(p) && Number(p) < PIN_ICONS.length)
  );
}

export function pinToIcons(pin: string): string {
  return pin
    .split(",")
    .map((i) => PIN_ICONS[Number(i)] ?? "?")
    .join("");
}
