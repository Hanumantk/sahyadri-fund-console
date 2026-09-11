// The demo clock. It starts at a fixed moment and ticks in real time.
// Every timer and relative time is derived from timestamps against this clock.

export const IST_OFFSET_MS = 330 * 60 * 1000;

export const DEMO_START_ISO = '2026-09-11T10:05:00+05:30';
export const DEMO_START_MS = Date.parse(DEMO_START_ISO);

const realStart = Date.now();

/** Current demo time in ms since epoch. */
export function demoNow(): number {
  return DEMO_START_MS + (Date.now() - realStart);
}

/** Parse an ISO string that carries the +05:30 offset. */
export function ms(iso: string): number {
  const v = Date.parse(iso);
  if (Number.isNaN(v)) throw new Error(`Bad timestamp: ${iso}`);
  return v;
}

/** Build a timestamp for today's demo date from "HH:MM" or "HH:MM:SS". */
export function today(hms: string): string {
  const parts = hms.split(':');
  const s = parts.length === 2 ? `${hms}:00` : hms;
  return `2026-09-11T${s}+05:30`;
}

/** Same, for the previous trading day. */
export function yesterday(hms: string): string {
  const parts = hms.split(':');
  const s = parts.length === 2 ? `${hms}:00` : hms;
  return `2026-09-10T${s}+05:30`;
}

/** Break a ms timestamp into IST wall-clock parts. */
export function istParts(t: number) {
  const d = new Date(t + IST_OFFSET_MS);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth(),
    day: d.getUTCDate(),
    weekday: d.getUTCDay(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    second: d.getUTCSeconds(),
  };
}

export const MARKET_OPEN_MS = ms(today('09:15'));
export const MARKET_CLOSE_MS = ms(today('15:30'));

export function isMarketOpen(t: number): boolean {
  return t >= MARKET_OPEN_MS && t <= MARKET_CLOSE_MS;
}
