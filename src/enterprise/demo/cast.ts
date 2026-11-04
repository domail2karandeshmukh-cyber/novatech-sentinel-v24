/**
 * Postgres-style casts for RPC arguments and jsonb payload fields (`p->>'key'`, `::int`, `::uuid`...),
 * with the same error texts Postgres raises for malformed input.
 */
import type { Json, JsonObject } from './types.ts';
import { DATE_RE, isTimestamp, pgText, tsMicros } from './pg.ts';
import { numText } from './model.ts';

const UUID_RE = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;
const syntax = (type: string, v: string): never => { throw new Error(`invalid input syntax for type ${type}: "${v}"`); };

/** `p->>'key'`: the text of a jsonb field (NULL when absent or JSON null). */
export function field(p: Json | undefined, key: string): string | null {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
  return jsonText(p[key]);
}
/** The text form of a jsonb value as `->>` returns it. */
export function jsonText(v: Json | undefined): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return numText(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return pgText(v);
}
/** `p ? 'key'` */
export const hasKey = (p: Json | undefined, key: string): boolean => !!p && typeof p === 'object' && !Array.isArray(p) && Object.prototype.hasOwnProperty.call(p, key);
/** `nullif(x, '')` */
export const nullif = (v: string | null): string | null => (v === '' ? null : v);
export const trimEmpty = (v: string | null | undefined): boolean => (v ?? '').trim() === '';

export function toInt(v: string | null): number | null {
  if (v === null) return null;
  const t = v.trim();
  if (!/^[+-]?\d+$/.test(t)) syntax('integer', v);
  const n = Number(t);
  if (n > 2147483647 || n < -2147483648) throw new Error(`value "${v}" is out of range for type integer`);
  return n;
}
export function toNumeric(v: string | null): number | null {
  if (v === null) return null;
  const t = v.trim();
  if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(t)) syntax('numeric', v);
  return Number(t);
}
export function toUuid(v: string | null): string | null {
  if (v === null) return null;
  if (!UUID_RE.test(v.trim())) syntax('uuid', v);
  const h = v.trim().replace(/-/g, '').toLowerCase();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
export function toBool(v: string | null): boolean | null {
  if (v === null) return null;
  const t = v.trim().toLowerCase();
  if (['t', 'true', 'y', 'yes', 'on', '1'].includes(t)) return true;
  if (['f', 'false', 'n', 'no', 'off', '0'].includes(t)) return false;
  return syntax('boolean', v);
}
export function toDate(v: string | null): string | null {
  if (v === null) return null;
  const t = v.trim();
  if (DATE_RE.test(t)) return t;
  if (isTimestamp(t)) return new Date(Math.floor(tsMicros(t) / 1000)).toISOString().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(t)) return t.slice(0, 10);
  return syntax('date', v);
}
/** `::timestamptz` in a UTC session, as microseconds. */
export function toTimestamp(v: string | null): number | null {
  if (v === null) return null;
  const t = v.trim();
  if (isTimestamp(t)) return tsMicros(t);
  if (DATE_RE.test(t)) return Date.parse(t + 'T00:00:00Z') * 1000;
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)$/.exec(t);
  if (m) return tsMicros(`${m[1]}T${m[2]}Z`);
  return syntax('timestamp with time zone', v);
}

// ---------------------------------------------------------------- top-level RPC arguments (PostgREST named parameters)
export type ArgType = 'text' | 'uuid' | 'int' | 'bigint' | 'bool' | 'numeric' | 'jsonb' | 'timestamptz' | 'bigint[]';
export type Param = { name: string; type: ArgType; optional?: boolean; def?: unknown };
/** A required parameter. */
export const P = (name: string, type: ArgType): Param => ({ name, type });
/** A parameter with a DEFAULT (NULL unless given). */
export const O = (name: string, type: ArgType, def: unknown = null): Param => ({ name, type, optional: true, def });

/** Converts PostgREST JSON arguments to the parameter types of the SQL function. */
export function coerceArgs(fn: string, params: Param[], raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const missing = params.filter(p => !p.optional && !(p.name in raw));
  if (missing.length) {
    throw new Error(`Could not find the function public.${fn}(${Object.keys(raw).sort().join(', ')}) in the schema cache`);
  }
  for (const p of params) {
    const v = p.name in raw ? raw[p.name] : p.def;
    out[p.name] = coerce(p.type, v === undefined ? null : v);
  }
  return out;
}
function coerce(type: ArgType, v: unknown): unknown {
  if (v === null) return null;
  switch (type) {
    case 'jsonb': return v as Json;
    case 'bigint[]': {
      if (!Array.isArray(v)) throw new Error('malformed array literal: "' + String(v) + '"');
      return v.map(x => toInt(typeof x === 'string' ? x : String(x)));
    }
    case 'bool': return typeof v === 'boolean' ? v : toBool(String(v));
    default: {
      const t = typeof v === 'string' ? v : typeof v === 'number' ? numText(v) : typeof v === 'boolean' ? String(v) : pgText(v);
      if (type === 'text') return t;
      if (type === 'uuid') return toUuid(t);
      if (type === 'int' || type === 'bigint') return toInt(t);
      if (type === 'numeric') return toNumeric(t);
      return toTimestamp(t);
    }
  }
}
export const asObject = (v: unknown): JsonObject => (v && typeof v === 'object' && !Array.isArray(v) ? (v as JsonObject) : {});
