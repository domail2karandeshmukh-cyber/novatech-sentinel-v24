import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { EUROPE_BORDERS, EUROPE_COAST, EUROPE_LAND, GEO_K, GEO_LAT0, GEO_LON0, LOIRE_PATH, REGION_COAST, REGION_FRAME, REGION_LAND } from '../data/geo';
import { EDGES, NODES, teleworkers } from '../data/company';
import type { AtlasNode, EdgeKind } from '../data/company';
import type { Run } from '../engine/incident';
import { gateDone, scenarioOf } from '../engine/incident';
import { moneyShort } from '../engine/incident';

const merc = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * 180 / Math.PI;
export const project = (lon: number, lat: number): [number, number] => [(lon - GEO_LON0) * GEO_K, (merc(GEO_LAT0) - merc(lat)) * GEO_K];

type Box = [minLon: number, maxLon: number, minLat: number, maxLat: number];
export type CameraName = 'europe' | 'hero' | 'overview' | 'region' | 'cloud' | 'payments';
const BOXES: Record<CameraName, Box> = {
  europe: [-12, 19, 38.5, 57],
  hero: [-5.3, 3.4, 45.9, 49.4],
  overview: [-5.4, 4.4, 45.4, 50.9],
  region: [-5.4, 3.0, 46.3, 48.95],
  cloud: [-3.6, 12.6, 44.6, 52.9],
  payments: [-3.6, 3.4, 46.5, 49.4],
};
/** Part of the viewport (fractions) the box must fit inside. The landing hero keeps the left half for its copy. */
type Frame = { x0: number; x1: number; y0: number; y1: number };
const FULL: Frame = { x0: 0, x1: 1, y0: 0, y1: 1 };
type Cam = { cx: number; cy: number; w: number; h: number };
function camFor(box: Box, aspect: number, pad = 0.04, frame: Frame = FULL): Cam {
  const [x0, y1] = project(box[0], box[2]);
  const [x1, y0] = project(box[1], box[3]);
  const bw = (x1 - x0) * (1 + pad * 2), bh = (y1 - y0) * (1 + pad * 2);
  const fw = frame.x1 - frame.x0, fh = frame.y1 - frame.y0;
  const w = Math.max(bw / fw, (bh / fh) * aspect), h = w / aspect;
  const fcx = (frame.x0 + frame.x1) / 2, fcy = (frame.y0 + frame.y1) / 2;
  return { cx: (x0 + x1) / 2 - (fcx - 0.5) * w, cy: (y0 + y1) / 2 - (fcy - 0.5) * h, w, h };
}
const HERO_FRAME: Frame = { x0: 0.5, x1: 0.9, y0: 0.16, y1: 0.84 };
function frameFor(mode: Props['mode'], camName: CameraName, aspect: number): Frame {
  return mode === 'landing' && camName === 'hero' && aspect > 1.15 ? HERO_FRAME : FULL;
}

export type NodeState = 'idle' | 'ok' | 'watch' | 'critical' | 'contained' | 'recovery';
export function nodeStates(run: Run | null | undefined): Record<string, NodeState> {
  const out: Record<string, NodeState> = {};
  for (const n of NODES) out[n.id] = 'ok';
  if (!run || run.status === 'ready') return out;
  const s = scenarioOf(run);
  const executed = gateDone(run, 'execute');
  const closed = run.status === 'closed';
  for (const id of s.atlas.watch) out[id] = closed || executed ? 'ok' : 'watch';
  for (const id of s.atlas.affected) out[id] = closed ? 'ok' : executed ? 'contained' : 'critical';
  if (s.atlas.recovery) out[s.atlas.recovery] = executed ? 'recovery' : 'ok';
  if (s.atlas.threat.length && !executed) out[s.atlas.threat[0]] = 'critical';
  return out;
}

export function cameraForRun(run: Run | null | undefined): CameraName {
  if (!run || run.status === 'ready') return 'overview';
  return run.scenarioId === 'cloud' ? 'cloud' : run.scenarioId === 'payments' ? 'payments' : 'region';
}

const STATE_LABEL: Record<NodeState, string> = { idle: 'Idle', ok: 'Normal', watch: 'Watch', critical: 'Critical', contained: 'Contained', recovery: 'Serving traffic' };
const KIND_LABEL: Record<AtlasNode['kind'], string> = { office: 'Office', cloud: 'Cloud region', bank: 'Finance', saas: 'SaaS', supplier: 'Supplier', clients: 'Client cluster', internet: 'External' };

function cssVar(el: Element, name: string, fallback: string) {
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  return v || fallback;
}

type Props = {
  mode: 'landing' | 'command' | 'audience' | 'mini';
  camera?: CameraName;
  run?: Run | null;
  intro?: boolean;
  interactive?: boolean;
  onNode?: (id: string) => void;
  className?: string;
  style?: CSSProperties;
  showTeleworkers?: boolean;
  label?: string;
  tour?: string;
};

export default function Atlas({ mode, camera, run, intro = false, interactive = true, onNode, className, style, showTeleworkers = true, label, tour }: Props) {
  const uid = useId().replace(/:/g, '');
  const wrap = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const markers = useRef<Record<string, HTMLButtonElement | null>>({});
  const camRef = useRef<Cam | null>(null);
  const tween = useRef<{ from: Cam; to: Cam; t0: number; dur: number } | null>(null);
  const sizeRef = useRef({ w: 1, h: 1, dpr: 1 });
  const [hover, setHover] = useState<string | null>(null);
  const [introDone, setIntroDone] = useState(!intro);
  const states = useMemo(() => nodeStates(run), [run]);
  const statesRef = useRef(states);
  statesRef.current = states;
  const camName: CameraName = camera ?? (mode === 'landing' ? 'hero' : cameraForRun(run));
  const homes = useMemo(() => teleworkers().map(h => project(h.lon, h.lat)), []);
  const reduced = typeof window !== 'undefined' && (document.documentElement.dataset.sMotion === 'reduce' || (document.documentElement.dataset.sMotion !== 'full' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches));
  const scenario = run ? scenarioOf(run) : null;
  const threatPath = useMemo(() => (run && run.status === 'active' && scenario ? scenario.atlas.threat : []), [run, scenario]);
  const threatRef = useRef(threatPath); threatRef.current = threatPath;
  const executedRef = useRef(false); executedRef.current = !!run && gateDone(run, 'execute');

  const edgeGeom = useMemo(() => EDGES.map(e => {
    const a = NODES.find(n => n.id === e.from)!, b = NODES.find(n => n.id === e.to)!;
    const [x0, y0] = project(a.lon, a.lat), [x1, y1] = project(b.lon, b.lat);
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
    const bend = e.kind === 'wan' ? 0.12 : e.kind === 'service' ? 0.16 : 0.2;
    const cx = mx - (dy / len) * len * bend, cy = my + (dx / len) * len * bend;
    return { ...e, x0, y0, x1, y1, cx, cy, d: `M${x0.toFixed(2)} ${y0.toFixed(2)}Q${cx.toFixed(2)} ${cy.toFixed(2)} ${x1.toFixed(2)} ${y1.toFixed(2)}` };
  }), []);
  const threatGeom = useMemo(() => {
    const segs: { x0: number; y0: number; x1: number; y1: number; cx: number; cy: number; d: string }[] = [];
    for (let i = 0; i < threatPath.length - 1; i++) {
      const a = NODES.find(n => n.id === threatPath[i])!, b = NODES.find(n => n.id === threatPath[i + 1])!;
      const [x0, y0] = project(a.lon, a.lat), [x1, y1] = project(b.lon, b.lat);
      const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
      const cx = mx + (dy / len) * len * 0.22, cy = my - (dx / len) * len * 0.22;
      segs.push({ x0, y0, x1, y1, cx, cy, d: `M${x0.toFixed(2)} ${y0.toFixed(2)}Q${cx.toFixed(2)} ${cy.toFixed(2)} ${x1.toFixed(2)} ${y1.toFixed(2)}` });
    }
    return segs;
  }, [threatPath]);
  const threatGeomRef = useRef(threatGeom); threatGeomRef.current = threatGeom;

  // Resize handling
  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      sizeRef.current = { w: Math.max(1, r.width), h: Math.max(1, r.height), dpr };
      const c = canvas.current;
      if (c) { c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr); c.style.width = `${r.width}px`; c.style.height = `${r.height}px`; }
      const aspect = r.width / Math.max(1, r.height);
      const target = camFor(BOXES[camName], aspect, 0.04, frameFor(mode, camName, aspect));
      if (!camRef.current || !tween.current) camRef.current = target; else tween.current.to = target;
      apply();
    });
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camName]);

  // Camera moves: the intro starts wide on Europe and settles on the hero frame; scenario changes refocus once.
  useEffect(() => {
    const { w, h } = sizeRef.current;
    const aspect = w / Math.max(1, h);
    const to = camFor(BOXES[camName], aspect, 0.04, frameFor(mode, camName, aspect));
    if (intro && !introDone && !reduced) {
      const from = camFor(BOXES.europe, aspect);
      camRef.current = from;
      tween.current = { from, to, t0: performance.now() + 200, dur: 1900 };
      const t = window.setTimeout(() => setIntroDone(true), 2400);
      return () => window.clearTimeout(t);
    }
    if (!camRef.current || reduced) { camRef.current = to; tween.current = null; apply(); return; }
    tween.current = { from: { ...camRef.current }, to, t0: performance.now(), dur: 950 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camName]);

  function project2screen(x: number, y: number): [number, number] {
    const cam = camRef.current!; const { w, h } = sizeRef.current;
    return [((x - (cam.cx - cam.w / 2)) / cam.w) * w, ((y - (cam.cy - cam.h / 2)) / cam.h) * h];
  }

  function apply() {
    const cam = camRef.current; if (!cam || !svg.current) return;
    svg.current.setAttribute('viewBox', `${(cam.cx - cam.w / 2).toFixed(2)} ${(cam.cy - cam.h / 2).toFixed(2)} ${cam.w.toFixed(2)} ${cam.h.toFixed(2)}`);
    for (const n of NODES) {
      const el = markers.current[n.id]; if (!el) continue;
      const [x, y] = project(n.lon, n.lat);
      const [sx, sy] = project2screen(x, y);
      const { w, h } = sizeRef.current;
      const off = sx < -40 || sy < -40 || sx > w + 40 || sy > h + 40;
      el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px)`;
      el.style.visibility = off ? 'hidden' : 'visible';
    }
  }

  // Animation loop: camera tween, markers and the canvas signal layer.
  useEffect(() => {
    let raf = 0; let visible = true; let last = performance.now();
    const particles = edgeGeom.flatMap((e, i) => Array.from({ length: e.kind === 'service' ? 1 : 2 }, (_, j) => ({ edge: i, t: (i * 0.137 + j * 0.5) % 1, speed: e.kind === 'wan' ? 0.16 : e.kind === 'finance' ? 0.12 : e.kind === 'replication' ? 0.1 : 0.08 })));
    const threat = Array.from({ length: 6 }, (_, j) => ({ seg: 0, t: j / 6 }));
    const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; }, { threshold: 0 });
    if (wrap.current) io.observe(wrap.current);
    const colors = { teal: '#35D6C1', crimson: '#FF5F74', amber: '#FFCA70', cobalt: '#6F95FF', text: '#EFF5FF', faint: 'rgba(158,177,199,.55)' };
    const readColors = () => {
      const el = wrap.current; if (!el) return;
      colors.teal = cssVar(el, '--s-teal', colors.teal); colors.crimson = cssVar(el, '--s-crimson', colors.crimson);
      colors.amber = cssVar(el, '--s-amber', colors.amber); colors.cobalt = cssVar(el, '--s-cobalt', colors.cobalt); colors.text = cssVar(el, '--s-text', colors.text);
    };
    readColors();
    const mo = new MutationObserver(readColors);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-s-theme'] });
    const bez = (t: number, a: number, c: number, b: number) => (1 - t) * (1 - t) * a + 2 * (1 - t) * t * c + t * t * b;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      // The camera keeps moving even off-screen, so a map scrolled into view is already framed.
      const tw = tween.current;
      if (tw) {
        const k = Math.min(1, Math.max(0, (now - tw.t0) / tw.dur));
        const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        camRef.current = { cx: tw.from.cx + (tw.to.cx - tw.from.cx) * e, cy: tw.from.cy + (tw.to.cy - tw.from.cy) * e, w: tw.from.w + (tw.to.w - tw.from.w) * e, h: tw.from.h + (tw.to.h - tw.from.h) * e };
        if (k >= 1) tween.current = null;
        apply();
      }
      if (document.hidden || !visible) return;
      const c = canvas.current; if (!c || !camRef.current) return;
      const ctx = c.getContext('2d'); if (!ctx) return;
      const { w, h, dpr } = sizeRef.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const st = statesRef.current;
      // teleworkers: 34 homes, 40% of staff — faint, steady
      if (showTeleworkers && mode !== 'mini') {
        ctx.fillStyle = colors.faint;
        for (const [x, y] of homes) { const [sx, sy] = project2screen(x, y); if (sx < 0 || sy < 0 || sx > w || sy > h) continue; ctx.globalAlpha = 0.55; ctx.beginPath(); ctx.arc(sx, sy, 1.4, 0, Math.PI * 2); ctx.fill(); }
        ctx.globalAlpha = 1;
      }
      if (reduced) return;
      // signals along dependency nerves
      for (const p of particles) {
        const e = edgeGeom[p.edge];
        const hot = st[e.from] === 'critical' || st[e.to] === 'critical';
        p.t += dt * p.speed * (hot ? 0.45 : 1);
        if (p.t > 1) p.t -= 1;
        const [ax, ay] = project2screen(e.x0, e.y0), [cx, cy] = project2screen(e.cx, e.cy), [bx, by] = project2screen(e.x1, e.y1);
        const x = bez(p.t, ax, cx, bx), y = bez(p.t, ay, cy, by);
        if (x < -10 || y < -10 || x > w + 10 || y > h + 10) continue;
        const col = hot ? colors.amber : e.kind === 'finance' ? colors.amber : colors.teal;
        const fade = Math.sin(p.t * Math.PI);
        ctx.globalAlpha = 0.25 + 0.65 * fade;
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(x, y, 1.7, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 0.12 * fade; ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      // threat path: crimson pulses travelling toward the affected node until the approved action executes
      const tg = threatGeomRef.current;
      if (tg.length && !executedRef.current) {
        for (const q of threat) {
          q.t += dt * 0.28;
          if (q.t > 1) { q.t -= 1; q.seg = (q.seg + 1) % tg.length; }
          const sgm = tg[q.seg];
          const [ax, ay] = project2screen(sgm.x0, sgm.y0), [cx, cy] = project2screen(sgm.cx, sgm.cy), [bx, by] = project2screen(sgm.x1, sgm.y1);
          const x = bez(q.t, ax, cx, bx), y = bez(q.t, ay, cy, by);
          ctx.fillStyle = colors.crimson; ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.arc(x, y, 2.4, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 0.18; ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      // blooms on critical nodes (slow, no strobe)
      for (const n of NODES) {
        const s = st[n.id]; if (s !== 'critical' && s !== 'recovery') continue;
        const [x, y] = project(n.lon, n.lat); const [sx, sy] = project2screen(x, y);
        const pulse = 0.5 + 0.5 * Math.sin(now / 900);
        const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, 46 + pulse * 10);
        const col = s === 'critical' ? colors.crimson : colors.cobalt;
        g.addColorStop(0, col); g.addColorStop(1, 'transparent');
        ctx.globalAlpha = 0.16 + pulse * 0.1; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, 56, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    };
    raf = requestAnimationFrame(frame);
    if (reduced) { apply(); const once = () => frame(performance.now()); requestAnimationFrame(once); }
    return () => { cancelAnimationFrame(raf); io.disconnect(); mo.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edgeGeom, homes, mode, showTeleworkers, reduced]);

  const hoverNode = hover ? NODES.find(n => n.id === hover) ?? null : null;
  const visibleNodes = NODES.filter(n => (n.kind !== 'internet' || states[n.id] !== 'ok') && (mode !== 'mini' || n.kind === 'office' || states[n.id] !== 'ok'));
  const summary = NODES.filter(n => states[n.id] !== 'ok').map(n => `${n.label}: ${STATE_LABEL[states[n.id]]}`).join('; ');
  const edgeClass = (k: EdgeKind, from: string, to: string) => `s-atlas-edge k-${k} ${states[from] === 'critical' || states[to] === 'critical' ? 'hot' : ''} ${states[to] === 'recovery' || states[from] === 'recovery' ? 'recovery' : ''}`;

  return (
    <div ref={wrap} className={`s-atlas m-${mode} ${introDone || reduced ? 'ready' : 'intro'} ${className ?? ''}`} style={style} data-tour={tour}>
      <svg ref={svg} className="s-atlas-map" preserveAspectRatio="none" role="img" aria-label={label ?? `Map of NOVATECH’s offices in Angers, Nantes and Rennes and their dependencies. ${summary || 'All nodes normal.'}`}>
        <defs>
          <pattern id={`s-grat-${uid}`} width={GEO_K} height={GEO_K} patternUnits="userSpaceOnUse"><path d={`M${GEO_K} 0H0V${GEO_K}`} fill="none" className="s-atlas-grat" /></pattern>
          {/* The coarse Europe outline is hidden inside the detailed regional frame so coasts never double up. */}
          <clipPath id={`s-out-${uid}`}><path clipRule="evenodd" d={`M-4000 -4000H8000V8000H-4000Z M${REGION_FRAME.x} ${REGION_FRAME.y}h${REGION_FRAME.w}v${REGION_FRAME.h}h${-REGION_FRAME.w}Z`} /></clipPath>
        </defs>
        <rect x={-2000} y={-2000} width={6000} height={6000} fill={`url(#s-grat-${uid})`} />
        <path d={EUROPE_LAND} className="s-atlas-land" clipPath={`url(#s-out-${uid})`} />
        <path d={REGION_LAND} className="s-atlas-land region" />
        <path d={EUROPE_BORDERS} className="s-atlas-border" />
        <path d={EUROPE_COAST} className="s-atlas-coast europe" clipPath={`url(#s-out-${uid})`} />
        <path d={REGION_COAST} className="s-atlas-coast region" />
        <path d={LOIRE_PATH} className="s-atlas-river" />
        {edgeGeom.map(e => <path key={e.id} d={e.d} className={edgeClass(e.kind, e.from, e.to)} />)}
        {threatGeom.map((g, i) => <path key={i} d={g.d} className={`s-atlas-threat ${run && gateDone(run, 'execute') ? 'cut' : ''}`} />)}
      </svg>
      <canvas ref={canvas} className="s-atlas-canvas" aria-hidden="true" />
      <div className="s-atlas-markers">
        {visibleNodes.map(n => {
          const st = states[n.id];
          const showLabel = n.kind === 'office' || st !== 'ok' || (mode === 'landing' || mode === 'audience') && (n.kind === 'cloud' || n.kind === 'bank') || mode === 'audience' && (n.kind === 'saas' || n.kind === 'supplier');
          const detail = n.kind === 'office' ? `${n.id === 'angers' ? 'Head office · ' : ''}${n.people} people` : n.kind === 'clients' ? `${n.clients} clients` : '';
          return (
            <button key={n.id} ref={el => { markers.current[n.id] = el; }} type="button" className={`s-node k-${n.kind} st-${st} lab-${n.lab ?? 'e'} ${showLabel ? 'labelled' : ''}`}
              tabIndex={interactive ? 0 : -1} aria-label={`${n.label} — ${KIND_LABEL[n.kind]}, ${STATE_LABEL[st]}. ${n.sub}`}
              onMouseEnter={() => interactive && setHover(n.id)} onMouseLeave={() => setHover(h => h === n.id ? null : h)}
              onFocus={() => interactive && setHover(n.id)} onBlur={() => setHover(h => h === n.id ? null : h)}
              onClick={() => interactive && onNode?.(n.id)} style={{ visibility: 'hidden' }}>
              <svg className="glyph" viewBox="-10 -10 20 20" aria-hidden="true">
                {n.kind === 'office' && <rect x={-5} y={-5} width={10} height={10} rx={2} />}
                {n.kind === 'cloud' && <rect x={-5} y={-5} width={10} height={10} rx={1.5} transform="rotate(45)" />}
                {(n.kind === 'bank' || n.kind === 'saas') && <polygon points="0,-6 5.2,-3 5.2,3 0,6 -5.2,3 -5.2,-3" />}
                {n.kind === 'supplier' && <polygon points="0,-6 6,5 -6,5" />}
                {n.kind === 'clients' && <circle r={4.6} />}
                {n.kind === 'internet' && <path d="M-5 -5L5 5M5 -5L-5 5" />}
              </svg>
              {showLabel && <span className="lbl"><b>{n.label}</b>{detail && mode !== 'mini' && <small>{detail}</small>}</span>}
            </button>
          );
        })}
      </div>
      {hoverNode && interactive && <AtlasTip node={hoverNode} state={states[hoverNode.id]} run={run ?? null} anchor={markers.current[hoverNode.id]} wrap={wrap.current} />}
    </div>
  );
}

function AtlasTip({ node, state, run, anchor, wrap }: { node: AtlasNode; state: NodeState; run: Run | null; anchor: HTMLElement | null; wrap: HTMLElement | null }) {
  if (!anchor || !wrap) return null;
  const a = anchor.getBoundingClientRect(), r = wrap.getBoundingClientRect();
  const x = Math.min(r.width - 250, Math.max(8, a.left - r.left + 16));
  const y = Math.min(r.height - 120, Math.max(8, a.top - r.top + 14));
  const deps = EDGES.filter(e => e.from === node.id || e.to === node.id).map(e => e.label);
  const s = run && run.status !== 'ready' ? scenarioOf(run) : null;
  const affected = s && s.atlas.affected.includes(node.id);
  return (
    <div className="s-atlas-tip" style={{ left: x, top: y }} role="tooltip">
      <div className="s-row between"><b>{node.label}</b><span className={`s-chip ${state === 'critical' ? 'crit' : state === 'watch' || state === 'contained' ? 'warn' : state === 'recovery' ? 'active' : 'ok'}`}>{STATE_LABEL[state]}</span></div>
      <p>{node.sub}</p>
      {node.people && <p className="s-small">{node.people} people (illustrative split of 85)</p>}
      {affected && s && <p className="s-small"><span className="s-crimson">{s.ref}</span> · {moneyShort(s.exposure)} modelled exposure</p>}
      {deps.length > 0 && <p className="s-small">Depends on: {[...new Set(deps)].slice(0, 3).join(', ')}</p>}
    </div>
  );
}
