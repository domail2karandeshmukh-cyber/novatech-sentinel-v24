import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// NOVATECH Sentinel V2.4 — one application.
// /v2-demo keeps the untouched V2.3 rehearsal available as a fallback; everything else is Sentinel.
// The original enterprise pages are hosted inside Sentinel and use Supabase only when it is configured.
const hashRouting = import.meta.env.VITE_ROUTER === 'hash';
const isLegacy = () => hashRouting ? window.location.hash.startsWith('#/v2') : window.location.pathname.startsWith('/v2');
const legacy = isLegacy();
// Hash-routed builds switch between the two apps without a navigation, so reload when crossing over.
if (hashRouting) window.addEventListener('hashchange', () => { if (isLegacy() !== legacy) window.location.reload(); });
if (legacy) {
  document.title = 'NOVATECH V2.3 · Risk Command Centre (fallback)';
  // The archived app itself stays untouched; a small fixed note says what it is and where the current product is.
  const note = document.createElement('aside');
  note.setAttribute('role', 'note');
  note.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:2147483000;max-width:min(560px,calc(100vw - 24px));padding:10px 38px 10px 14px;border-radius:12px;background:#2a2108;color:#ffe7a8;border:1px solid rgba(255,202,112,.55);font:500 13px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;box-shadow:0 12px 30px -12px rgba(0,0,0,.6)';
  const home = hashRouting ? '#/' : '/';
  note.innerHTML = `<b>Archived V2.3 rehearsal</b>, kept as a fallback. Its roles use the old generic labels (Director, IT Operations); <a href="${home}" style="color:#ffd27a">NOVATECH Sentinel V2.4</a> uses the six Group 1 roles.`;
  const close = document.createElement('button');
  close.type = 'button'; close.setAttribute('aria-label', 'Hide this note'); close.textContent = '×';
  close.style.cssText = 'position:absolute;right:8px;top:6px;border:0;background:transparent;color:#ffe7a8;font-size:18px;cursor:pointer;line-height:1';
  close.onclick = () => note.remove();
  note.appendChild(close);
  document.body.appendChild(note);
}

const page = legacy
  ? import('./styles.css').then(() => import('./v2/DemoApp'))
  : import('./sentinel/App');

page.then(({ default: App }) => {
  createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
}).catch(error => {
  console.error('NOVATECH initialization error', error);
  const root = document.getElementById('root');
  if (root) root.textContent = 'Unable to load NOVATECH Sentinel. Reload the page; if it persists, check the browser console.';
});
