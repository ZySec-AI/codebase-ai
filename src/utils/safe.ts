export const MAX_TITLE_LEN = 200;
export const MAX_LABEL_LEN = 50;
export const MAX_LOGIN_LEN = 100;

export function safe(s: string | null | undefined, max: number): string {
  if (!s) {
    return "";
  }
  return String(s).slice(0, max);
}
