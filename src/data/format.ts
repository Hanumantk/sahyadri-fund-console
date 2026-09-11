import { istParts } from './clock';

const CR = 10_000_000;
const LAKH = 100_000;
export const MINUS = '−';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function fixed(n: number, d: number): string {
  const s = Math.abs(n).toFixed(d);
  return n < 0 && Number(s) !== 0 ? `${MINUS}${s}` : s;
}

/** ₹ in crore with one decimal, e.g. "₹5.0 cr". Negative values carry a true minus. */
export function fmtCr(rupees: number, decimals = 1): string {
  const v = rupees / CR;
  const s = fixed(v, decimals);
  return s.startsWith(MINUS) ? `${MINUS}₹${s.slice(1)} cr` : `₹${s} cr`;
}

/** ₹ in lakh with one decimal, e.g. "₹17.6 lakh". */
export function fmtLakh(rupees: number, decimals = 1): string {
  const v = rupees / LAKH;
  const s = fixed(v, decimals);
  return s.startsWith(MINUS) ? `${MINUS}₹${s.slice(1)} lakh` : `₹${s} lakh`;
}

/** Picks crore for ≥ ₹1 cr, otherwise lakh. */
export function fmtMoney(rupees: number): string {
  return Math.abs(rupees) >= CR ? fmtCr(rupees) : fmtLakh(rupees);
}

/** Signed crore, e.g. "+₹2.1 cr" or "−₹3.5 cr". */
export function fmtSignedCr(rupees: number, decimals = 1): string {
  const v = rupees / CR;
  const zeroThreshold = 0.5 * 10 ** -decimals;
  if (Math.abs(v) < zeroThreshold) return `₹${(0).toFixed(decimals)} cr`;
  return v > 0 ? `+₹${v.toFixed(decimals)} cr` : `${MINUS}₹${Math.abs(v).toFixed(decimals)} cr`;
}

/** Percent with one decimal, unsigned, e.g. "2.0%". */
export function fmtPct(pct: number, decimals = 1): string {
  return `${fixed(pct, decimals)}%`;
}

/** Signed percent, e.g. "+0.85%", "−1.10%". */
export function fmtSignedPct(pct: number, decimals = 2): string {
  if (Math.abs(pct) < 10 ** -(decimals + 1)) return `0.${'0'.repeat(decimals)}%`;
  return pct > 0 ? `+${pct.toFixed(decimals)}%` : `${MINUS}${Math.abs(pct).toFixed(decimals)}%`;
}

/** A share price, e.g. "₹1,173.30". A price is not a gain, so it is never signed. */
export function fmtPrice(rupees: number): string {
  return `₹${rupees.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** A compact share price: whole rupees stay whole; paise appear when present. */
export function fmtPriceCompact(rupees: number): string {
  const decimals = Number.isInteger(rupees) ? 0 : 2;
  return `₹${rupees.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString('en-IN');
}

/** "10:17" in IST, 24-hour. */
export function fmtTime(t: number): string {
  const p = istParts(t);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

/** "10:17:05" in IST. */
export function fmtTimeSec(t: number): string {
  const p = istParts(t);
  return `${fmtTime(t)}:${String(p.second).padStart(2, '0')}`;
}

/** "11 Sep 2026" */
export function fmtDate(t: number): string {
  const p = istParts(t);
  return `${p.day} ${MONTHS[p.month]} ${p.year}`;
}

/** "11 Sep" */
export function fmtDayMonth(t: number): string {
  const p = istParts(t);
  return `${p.day} ${MONTHS[p.month]}`;
}

/** "Fri 11 Sep 2026" */
export function fmtWeekdayDate(t: number): string {
  const p = istParts(t);
  return `${DAYS[p.weekday]} ${p.day} ${MONTHS[p.month]} ${p.year}`;
}

/** "Mon 14 Sep" */
export function fmtWeekdayDayMonth(t: number): string {
  const p = istParts(t);
  return `${DAYS[p.weekday]} ${p.day} ${MONTHS[p.month]}`;
}

/** Signed percentage-point distance, e.g. "−0.35 pts". */
export function fmtPoints(points: number, decimals = 2): string {
  const s = Math.abs(points).toFixed(decimals);
  if (Math.abs(points) < 10 ** -(decimals + 1)) return `${Number(s).toFixed(decimals)} pts`;
  return `${points > 0 ? '+' : MINUS}${s} pts`;
}

/** "11 Sep 2026 09:52:00 IST" */
export function fmtDateTimeSec(t: number): string {
  return `${fmtDate(t)} ${fmtTimeSec(t)} IST`;
}

/** Parse a "YYYY-MM-DD" date as an IST midnight timestamp. */
export function dateMs(isoDate: string): number {
  return Date.parse(`${isoDate}T00:00:00+05:30`);
}

/** "8 sec ago", "4 min ago", "1 h 12 min ago". */
export function fmtAgo(from: number, now: number): string {
  const s = Math.max(0, Math.floor((now - from) / 1000));
  if (s < 60) return `${s} sec ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `${h} h ${rm} min ago` : `${h} h ago`;
}

/** Short age, e.g. "8 sec", "12 min", "1 h 4 min". */
export function fmtAge(from: number, now: number): string {
  return fmtAgo(from, now).replace(' ago', '');
}

/** "12 min left", "45 sec left", "1 h 5 min left". Zero or less returns "Expired". */
export function fmtLeft(msLeft: number): string {
  if (msLeft <= 0) return 'Expired';
  const s = Math.ceil(msLeft / 1000);
  if (s < 60) return `${s} sec left`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min left`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `${h} h ${rm} min left` : `${h} h left`;
}

/** Days between two timestamps, rounded down. */
export function daysBetween(from: number, to: number): number {
  return Math.max(0, Math.floor((to - from) / 86_400_000));
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return n === 1 ? one : many;
}
