/**
 * Small, dependency-free helpers that reproduce Postgres behaviour the simulated backend relies on:
 * the canonical jsonb text form, SHA-256 (synchronous, pure JS), timestamp formats, text ordering
 * close to the en_US.UTF-8 collation, and numeric rounding.
 */

// ---------------------------------------------------------------- jsonb::text
const encoder = new TextEncoder();

function compareKeys(a: string, b: string): number {
  const x = encoder.encode(a), y = encoder.encode(b);
  if (x.length !== y.length) return x.length - y.length;
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

function quote(s: string): string {
  let out = '"';
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    if (ch === '"') out += '\\"';
    else if (ch === '\\') out += '\\\\';
    else if (cp === 8) out += '\\b';
    else if (cp === 12) out += '\\f';
    else if (cp === 10) out += '\\n';
    else if (cp === 13) out += '\\r';
    else if (cp === 9) out += '\\t';
    else if (cp < 32) out += '\\u' + cp.toString(16).padStart(4, '0');
    else out += ch;
  }
  return out + '"';
}

/** Postgres `jsonb::text`: keys ordered by byte length then bytes, ", " and ": " separators. */
export function pgText(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
  if (typeof value === 'string') return quote(value);
  if (Array.isArray(value)) return '[' + value.map(pgText).join(', ') + ']';
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).filter(k => obj[k] !== undefined).sort(compareKeys);
  return '{' + keys.map(k => quote(k) + ': ' + pgText(obj[k])).join(', ') + '}';
}

// ---------------------------------------------------------------- SHA-256
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

/** SHA-256 of the UTF-8 encoding of `text`, as lowercase hex. Synchronous and dependency-free. */
export function sha256Hex(text: string): string {
  const bytes = encoder.encode(text);
  const total = ((bytes.length + 9 + 63) >> 6) << 6;
  const buf = new Uint8Array(total);
  buf.set(bytes);
  buf[bytes.length] = 0x80;
  const view = new DataView(buf.buffer);
  const bits = bytes.length * 8;
  view.setUint32(total - 8, Math.floor(bits / 0x100000000));
  view.setUint32(total - 4, bits >>> 0);
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
    for (let i = 0; i < 64; i++) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + s1 + ch + K[i] + w[i]) | 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (s0 + maj) | 0;
      hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h[0] = (h[0] + a) | 0; h[1] = (h[1] + b) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
    h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
  }
  let hex = '';
  for (let i = 0; i < 8; i++) hex += h[i].toString(16).padStart(8, '0');
  return hex;
}

// ---------------------------------------------------------------- time
const TS_RE = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}(?::\d{2})?)(?:\.(\d{1,9}))?(Z|[+-]\d{2}(?::?\d{2})?)$/;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const DAY_MS = 86400000;
/** True for an ISO-8601 timestamp with a time zone (the JSON form of timestamptz, or Date#toISOString()). */
export const isTimestamp = (s: string) => TS_RE.test(s);

function zoneSuffix(zone: string): string {
  if (zone === 'Z') return 'Z';
  if (/^[+-]\d{2}$/.test(zone)) return zone + ':00';
  if (/^[+-]\d{4}$/.test(zone)) return zone.slice(0, 3) + ':' + zone.slice(3);
  return zone;
}
/** Microseconds since the epoch of a timestamptz text, exact to the microsecond. */
export function tsMicros(iso: string): number {
  const m = TS_RE.exec(iso);
  if (!m) throw new Error('VALIDATION: invalid timestamp "' + iso + '"');
  const time = m[2].length === 5 ? m[2] + ':00' : m[2];
  const base = Date.parse(`${m[1]}T${time}${zoneSuffix(m[4])}`);
  if (Number.isNaN(base)) throw new Error('VALIDATION: invalid timestamp "' + iso + '"');
  return base * 1000 + Number((m[3] ?? '').padEnd(6, '0').slice(0, 6));
}
/** A timestamptz rendered like Postgres JSON in a UTC session: 2026-10-27T22:00:00.12345+00:00 (fraction trimmed). */
export function pgTs(micros: number): string {
  const millis = Math.floor(micros / 1000);
  const d = new Date(millis);
  const frac = String(d.getUTCMilliseconds() * 1000 + (micros - millis * 1000)).padStart(6, '0').replace(/0+$/, '');
  return d.toISOString().slice(0, 19) + (frac ? '.' + frac : '') + '+00:00';
}
/** `to_char(ts at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US')`, as used by grc.audit_hash_row. */
export function hashTimestamp(iso: string): string {
  const micros = tsMicros(iso);
  const millis = Math.floor(micros / 1000);
  const d = new Date(millis);
  return d.toISOString().slice(0, 19) + '.' + String(d.getUTCMilliseconds() * 1000 + (micros - millis * 1000)).padStart(6, '0');
}
/** Days since 1970-01-01 of a date text (for ordering and arithmetic). */
export const dayNumber = (date: string) => Math.round(Date.parse(date + 'T00:00:00Z') / DAY_MS);
export const utcDate = (millis: number) => new Date(millis).toISOString().slice(0, 10);
export function addDays(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
/** `date + interval 'n months'` (the day is clamped to the end of a shorter month). */
export function addMonths(date: string, months: number): string {
  const [y, m, day] = date.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, last));
  return target.toISOString().slice(0, 10);
}
/** `timestamptz + interval 'n months'` in a UTC session. */
export function addMonthsMicros(micros: number, months: number): number {
  const millis = Math.floor(micros / 1000);
  const day = utcDate(millis);
  const shifted = Date.parse(addMonths(day, months) + 'T00:00:00Z');
  return (shifted + (millis - Date.parse(day + 'T00:00:00Z'))) * 1000 + (micros - millis * 1000);
}
/** `to_char(ts at time zone 'Europe/Paris', 'DD Mon HH24:MI')` */
export function parisDayMonthTime(micros: number): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(Math.floor(micros / 1000)));
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '';
  return `${get('day')} ${get('month').slice(0, 3)} ${get('hour')}:${get('minute')}`;
}
/** `to_char(clock_timestamp(), 'YYYYMMDDHH24MISSUS')` (UTC). */
export function compactTimestamp(micros: number): string {
  return hashTimestamp(pgTs(micros)).replace(/[-T:.]/g, '');
}

// ---------------------------------------------------------------- ordering and numbers
/*
 * Text ordering of the production database (PostgreSQL 17, glibc en_US.UTF-8, ISO 14651 rules):
 * punctuation and spaces are NOT ignored; they sort before digits, digits before letters.
 * Level 1 compares base characters, level 2 accents, level 3 case (lower case first); Postgres
 * finally breaks remaining ties with a byte comparison. Calibrated against production with
 * "1-1 | 11 | a b | A b | a_b | a-c | a.b | a(b | aa | ab | Ab | ac | C-01 | C01 | e | é | f | lea | Lea | LEA | Léa | R1 | R1059 | R2".
 */
const PUNCTUATION = [' ', '\u00a0', '_', '-', '\u2010', '\u2011', '\u2012', '\u2013', '\u2014', '\u2015', ',', ';', ':', '!', '?', '.', '\u2026', '\u00b7',
  "'", '\u2018', '\u2019', '"', '\u201c', '\u201d', '\u00ab', '\u00bb', '(', ')', '[', ']', '{', '}', '\u00a7', '\u00b6', '@', '*', '/', '\\', '&', '#', '%',
  '\u2030', '\u2020', '\u2021', '\u2022', '`', '\u00b4', '^', '\u00a8', '+', '\u00b1', '\u00f7', '\u00d7', '<', '=', '>', '\u00ac', '|', '\u00a6', '~',
  '\u2190', '\u2191', '\u2192', '\u2193', '\u2264', '\u2265', '\u00b0', '$', '\u00a3', '\u00a5', '\u20ac'];
const PUNCT_WEIGHT = new Map(PUNCTUATION.map((ch, i) => [ch, 10 + i]));
const DIGIT_BASE = 200, LETTER_BASE = 300, OTHER_BASE = 100000;
// Secondary weights of combining accents (DUCET order for the Latin diacritics that occur in French and English text).
const ACCENTS = ['\u0301', '\u0300', '\u0306', '\u0302', '\u030c', '\u030a', '\u0308', '\u030b', '\u0303', '\u0307', '\u0327', '\u0328', '\u0304'];
const ACCENT_WEIGHT = new Map(ACCENTS.map((ch, i) => [ch, 1 + i]));
type CollKey = { p: number[]; s: number[]; t: number[] };
const keyCache = new Map<string, CollKey>();

function collationKey(text: string): CollKey {
  const hit = keyCache.get(text);
  if (hit) return hit;
  const p: number[] = [], s: number[] = [], t: number[] = [];
  for (const ch of text.normalize('NFD')) {
    const accent = ACCENT_WEIGHT.get(ch);
    if (accent !== undefined || /\p{M}/u.test(ch)) { if (s.length) s[s.length - 1] = accent ?? 50; continue; }
    const cp = ch.codePointAt(0) ?? 0;
    if (cp < 32 || cp === 127) continue; // control characters are ignorable
    const lower = ch.toLowerCase();
    if (lower >= 'a' && lower <= 'z' && lower.length === 1) { p.push(LETTER_BASE + lower.charCodeAt(0)); s.push(0); t.push(ch === lower ? 0 : 1); continue; }
    if (ch >= '0' && ch <= '9') { p.push(DIGIT_BASE + ch.charCodeAt(0)); s.push(0); t.push(0); continue; }
    const pw = PUNCT_WEIGHT.get(ch);
    if (pw !== undefined) { p.push(pw); s.push(0); t.push(0); continue; }
    if (/\p{L}/u.test(ch)) { p.push(OTHER_BASE + (lower.codePointAt(0) ?? cp)); s.push(0); t.push(ch === lower ? 0 : 1); continue; }
    p.push(150); s.push(0); t.push(0); // remaining symbols: after punctuation, before digits
  }
  const key = { p, s, t };
  if (keyCache.size > 20000) keyCache.clear();
  keyCache.set(text, key);
  return key;
}
function cmpArrays(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return x.length - y.length;
}
function cmpBytes(a: string, b: string): number {
  const x = encoder.encode(a), y = encoder.encode(b);
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return x.length - y.length;
}
/** Compares two non-null texts like `ORDER BY text_column` in the production database. */
export function collateText(a: string, b: string): number {
  if (a === b) return 0;
  const x = collationKey(a), y = collationKey(b);
  return cmpArrays(x.p, y.p) || cmpArrays(x.s, y.s) || cmpArrays(x.t, y.t) || cmpBytes(a, b);
}
/** Text ordering with nulls last (ascending). */
export function collate(a: string | null | undefined, b: string | null | undefined): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  return collateText(a, b);
}

/** A sortable SQL value: numbers (also timestamps as microseconds and dates as day numbers), texts (collated), booleans. */
export type SortValue = number | string | boolean | null | undefined;
export type SortKey<T> = [(row: T) => SortValue, ('asc' | 'desc')?, ('first' | 'last')?];
function cmpValues(a: number | string | boolean, b: number | string | boolean): number {
  if (typeof a === 'string' && typeof b === 'string') return collateText(a, b);
  if (typeof a === 'boolean' && typeof b === 'boolean') return a === b ? 0 : a ? 1 : -1;
  return (a as number) < (b as number) ? -1 : (a as number) > (b as number) ? 1 : 0;
}
/** An ORDER BY comparator: `orderBy([x => x.score, 'desc', 'last'], [x => x.code])`. Postgres defaults: ASC nulls last, DESC nulls first. */
export function orderBy<T>(...keys: SortKey<T>[]): (a: T, b: T) => number {
  return (a, b) => {
    for (const [get, dir = 'asc', nulls = dir === 'asc' ? 'last' : 'first'] of keys) {
      const x = get(a), y = get(b);
      const xn = x === null || x === undefined, yn = y === null || y === undefined;
      if (xn || yn) { if (xn && yn) continue; return (xn ? 1 : -1) * (nulls === 'last' ? 1 : -1); }
      const c = cmpValues(x as number | string | boolean, y as number | string | boolean);
      if (c !== 0) return dir === 'asc' ? c : -c;
    }
    return 0;
  };
}

/*
 * Postgres' in-memory sort (src/include/lib/sort_template.h): insertion sort below 7 elements,
 * a presorted check, then Bentley-McIlroy quicksort. It is not stable, so reproducing it exactly
 * (with rows fed in heap order) gives the same order of ties as production.
 */
function med3<T>(v: T[], i: number, j: number, k: number, cmp: (a: T, b: T) => number): number {
  return cmp(v[i], v[j]) < 0
    ? (cmp(v[j], v[k]) < 0 ? j : (cmp(v[i], v[k]) < 0 ? k : i))
    : (cmp(v[j], v[k]) > 0 ? j : (cmp(v[i], v[k]) < 0 ? i : k));
}
function swap<T>(v: T[], i: number, j: number) { const t = v[i]; v[i] = v[j]; v[j] = t; }
function swapN<T>(v: T[], i: number, j: number, n: number) { for (let k = 0; k < n; k++) swap(v, i + k, j + k); }
function pgQsort<T>(v: T[], start: number, count: number, cmp: (a: T, b: T) => number): void {
  let a = start, n = count;
  for (;;) {
    if (n < 7) {
      for (let pm = a + 1; pm < a + n; pm++) for (let pl = pm; pl > a && cmp(v[pl - 1], v[pl]) > 0; pl--) swap(v, pl, pl - 1);
      return;
    }
    let presorted = true;
    for (let pm = a + 1; pm < a + n; pm++) if (cmp(v[pm - 1], v[pm]) > 0) { presorted = false; break; }
    if (presorted) return;
    let pm = a + Math.floor(n / 2);
    if (n > 7) {
      let pl = a, pn = a + n - 1;
      if (n > 40) {
        const d = Math.floor(n / 8);
        pl = med3(v, pl, pl + d, pl + 2 * d, cmp);
        pm = med3(v, pm - d, pm, pm + d, cmp);
        pn = med3(v, pn - 2 * d, pn - d, pn, cmp);
      }
      pm = med3(v, pl, pm, pn, cmp);
    }
    swap(v, a, pm);
    let pa = a + 1, pb = a + 1, pc = a + n - 1, pd = a + n - 1;
    for (;;) {
      let r = 0;
      while (pb <= pc && (r = cmp(v[pb], v[a])) <= 0) { if (r === 0) { swap(v, pa, pb); pa++; } pb++; }
      while (pb <= pc && (r = cmp(v[pc], v[a])) >= 0) { if (r === 0) { swap(v, pc, pd); pd--; } pc--; }
      if (pb > pc) break;
      swap(v, pb, pc); pb++; pc--;
    }
    const pn = a + n;
    let d1 = Math.min(pa - a, pb - pa);
    swapN(v, a, pb - d1, d1);
    d1 = Math.min(pd - pc, pn - pd - 1);
    swapN(v, pb, pn - d1, d1);
    d1 = pb - pa;
    const d2 = pd - pc;
    if (d1 <= d2) {
      if (d1 > 1) pgQsort(v, a, d1, cmp);
      if (d2 > 1) { a = pn - d2; n = d2; continue; }
    } else {
      if (d2 > 1) pgQsort(v, pn - d2, d2, cmp);
      if (d1 > 1) { n = d1; continue; }
    }
    return;
  }
}
/** Sorts a copy of `rows` exactly as Postgres orders the same input (ties included). */
export function pgSort<T>(rows: readonly T[], cmp: (a: T, b: T) => number): T[] {
  const v = [...rows];
  if (v.length > 1) pgQsort(v, 0, v.length, cmp);
  return v;
}
/** Shorthand: pgSort with an ORDER BY key list. */
export function sortRows<T>(rows: readonly T[], ...keys: SortKey<T>[]): T[] {
  return pgSort(rows, orderBy(...keys));
}
/** Numeric ascending with nulls last (Postgres default for ASC). */
export function cmpNum(a: number | null | undefined, b: number | null | undefined): number {
  const an = a === null || a === undefined, bn = b === null || b === undefined;
  if (an || bn) return an === bn ? 0 : an ? 1 : -1;
  return a - b;
}

// ---------------------------------------------------------------- SQL three-valued logic
export type Bool3 = boolean | null;
export const and3 = (...v: Bool3[]): Bool3 => (v.some(x => x === false) ? false : v.some(x => x === null) ? null : true);
export const or3 = (...v: Bool3[]): Bool3 => (v.some(x => x === true) ? true : v.some(x => x === null) ? null : false);
export const not3 = (v: Bool3): Bool3 => (v === null ? null : !v);
/** `a = b` with SQL nulls. */
export const eq3 = (a: unknown, b: unknown): Bool3 => (a === null || a === undefined || b === null || b === undefined ? null : a === b);
/** `a < b` with SQL nulls (numbers). */
export const lt3 = (a: number | null | undefined, b: number | null | undefined): Bool3 => (a === null || a === undefined || b === null || b === undefined ? null : a < b);
/** `a IS DISTINCT FROM b`. */
export const distinct = (a: unknown, b: unknown): boolean => (a ?? null) !== (b ?? null);

/** Postgres round(numeric): half away from zero. */
export function pgRound(x: number): number {
  const r = Math.floor(Math.abs(x) + 0.5);
  return x < 0 ? -r : r;
}
/** `to_char(n, 'FM999G999G999')` with an en_US group separator. */
export function groupThousands(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// ---------------------------------------------------------------- ids
export function uuid(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const hex = '0123456789abcdef';
  let s = '';
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) s += '-';
    else if (i === 14) s += '4';
    else if (i === 19) s += hex[8 + Math.floor(Math.random() * 4)];
    else s += hex[Math.floor(Math.random() * 16)];
  }
  return s;
}
export function randomHex(n: number): string {
  let s = '';
  for (let i = 0; i < n; i++) s += '0123456789abcdef'[Math.floor(Math.random() * 16)];
  return s;
}

/** Deep copy of plain JSON data. */
export function clone<T>(v: T): T {
  return v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T);
}

/** SQL LIKE / ILIKE pattern to a RegExp (`%` any run, `_` one character, backslash escapes). */
export function likeToRegExp(pattern: string, insensitive: boolean): RegExp {
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '\\' && i + 1 < pattern.length) { re += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); continue; }
    if (ch === '%') re += '[\\s\\S]*';
    else if (ch === '_') re += '[\\s\\S]';
    else re += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp('^' + re + '$', insensitive ? 'i' : '');
}
