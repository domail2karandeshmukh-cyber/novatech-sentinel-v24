/**
 * Routing mode. The deployed site uses normal paths (/command, /present/audience …).
 * A hash-routed build (VITE_ROUTER=hash, relative base) exists only for hosts that serve the app
 * from a single page URL, such as an interim preview; it changes nothing else.
 */
export const HASH_ROUTING = import.meta.env.VITE_ROUTER === 'hash';

/** Absolute URL for an in-app path, for places that cannot use a React Router link (window.open, plain anchors). */
export function appUrl(path: string): string {
  return HASH_ROUTING ? `${window.location.pathname}${window.location.search}#${path}` : path;
}
