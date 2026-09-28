export const asString = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
export const asNumber = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;
export const asStringArray = (v: unknown, fallback: string[]): string[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string') ? (v as string[]) : fallback;
