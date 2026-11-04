import { useMemo, useRef, useState } from 'react';
import { CircleAlert, CircleCheck, CircleDot, Clock3 } from 'lucide-react';
import { APPETITE_LIMIT, LEVEL_LABEL, REGISTER, kriStatus, levelOf, scoreOf, topExposures } from '../data/register';
import type { Kri, RiskEntry } from '../data/register';
import { DEPT_NAMES } from '../data/scenarios';
import type { DeptKey } from '../data/scenarios';
import { deptReadiness, scenarioOf, taskStatus } from '../engine/incident';
import type { Run, TaskStatus } from '../engine/incident';

/** "1 breaches" reads wrong: singular units when the value is exactly one. */
function unitFor(unit: string, value: number): string {
  if (value !== 1 || unit.includes(' ')) return unit;
  return unit.endsWith('ches') || unit.endsWith('shes') ? unit.slice(0, -2) : unit.endsWith('s') && unit.length > 2 ? unit.slice(0, -1) : unit;
}

/** 4×4 likelihood × impact heatmap. Cells carry level colour + text; every value is also in the table view. */
export function Heatmap({ highlight, onPick }: { highlight?: string[]; onPick?: (r: RiskEntry) => void }) {
  const [tip, setTip] = useState<{ l: number; i: number } | null>(null);
  const cells = useMemo(() => {
    const m: Record<string, RiskEntry[]> = {};
    for (const r of REGISTER) (m[`${r.likelihood}-${r.impact}`] ??= []).push(r);
    return m;
  }, []);
  return (
    <figure className="s-heat" data-tour="cmd-heatmap" aria-label="Risk heatmap, likelihood by impact">
      <div className="s-heat-grid" role="grid">
        {[4, 3, 2, 1].map(l => (
          <div className="s-heat-row" role="row" key={l}>
            <span className="s-heat-axis" role="rowheader">{l}</span>
            {[1, 2, 3, 4].map(i => {
              const list = cells[`${l}-${i}`] ?? [];
              const lvl = levelOf(l * i);
              const hot = list.some(r => highlight?.includes(r.code));
              return (
                <button key={i} role="gridcell" className={`s-heat-cell lv-${lvl} ${list.length ? 'has' : ''} ${hot ? 'hot' : ''}`}
                  aria-label={`Likelihood ${l}, impact ${i}, score ${l * i} (${LEVEL_LABEL[lvl]}): ${list.length ? list.map(r => `${r.code} ${r.title}`).join('; ') : 'no risks'}`}
                  onMouseEnter={() => setTip({ l, i })} onMouseLeave={() => setTip(null)} onFocus={() => setTip({ l, i })} onBlur={() => setTip(null)}
                  onClick={() => list[0] && onPick?.(list[0])}>
                  {list.map(r => <span key={r.code} className="s-heat-code">{r.code}</span>)}
                  {tip && tip.l === l && tip.i === i && list.length > 0 && (
                    <span className="s-heat-tip" role="tooltip">{list.map(r => <span key={r.code}><b>{r.code}</b> {r.title} · {scoreOf(r)}/16 · {r.owner}</span>)}</span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
        <div className="s-heat-row s-heat-xaxis"><span className="s-heat-axis" />{[1, 2, 3, 4].map(i => <span key={i} className="s-heat-axis">{i}</span>)}</div>
      </div>
      <figcaption className="s-heat-cap"><span>Likelihood ↑ · Impact →</span>
        <span className="s-legend">{(['low', 'moderate', 'high', 'critical'] as const).map(l => <span key={l}><i className={`lv-${l}`} />{LEVEL_LABEL[l]}</span>)}</span>
      </figcaption>
    </figure>
  );
}

export function TopExposures({ highlight, onPick }: { highlight?: string[]; onPick?: (r: RiskEntry) => void }) {
  const top = topExposures(5);
  return (
    <div className="s-top5" data-tour="cmd-top5">
      <ol>
        {top.map(r => {
          const sc = scoreOf(r); const out = sc > APPETITE_LIMIT;
          return (
            <li key={r.code} className={highlight?.includes(r.code) ? 'hot' : ''}>
              <button onClick={() => onPick?.(r)} aria-label={`${r.code} ${r.title}: score ${sc} of 16, ${out ? 'outside appetite' : 'within appetite'}. Owner ${r.owner}.`}>
                <span className="s-top5-code s-mono">{r.code}</span>
                <span className="s-top5-main"><b>{r.title}</b><small>{r.owner}{r.ownerTeam === 'fictional' ? ' (fictional employee)' : ''} · {r.department}</small></span>
                <span className="s-top5-bar" aria-hidden="true"><i className={out ? 'out' : ''} style={{ width: `${(sc / 16) * 100}%` }} /><em style={{ left: `${(APPETITE_LIMIT / 16) * 100}%` }} /></span>
                <span className="s-top5-score s-num">{sc}</span>
                <span className={`s-chip ${out ? 'crit' : 'warn'}`}>{out ? <CircleAlert size={13} /> : <CircleDot size={13} />}{out ? 'Outside appetite' : LEVEL_LABEL[levelOf(sc)]}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="s-small" style={{ margin: '8px 0 0' }}>Scale 1–16. The marker on each bar is the board’s appetite limit (11). Values: Group 1 case register.</p>
    </div>
  );
}

const TASK_ICON: Record<TaskStatus, JSX.Element> = { done: <CircleCheck size={13} />, open: <Clock3 size={13} />, overdue: <CircleAlert size={13} />, planned: <CircleDot size={13} /> };
const TASK_LABEL: Record<TaskStatus, string> = { done: 'Completed', open: 'Open', overdue: 'Overdue', planned: 'Planned' };

/** Open / completed / overdue tasks per department (stacked bars with 2px gaps) + totals. */
export function TaskStatusChart({ run, now }: { run: Run; now: number }) {
  const s = scenarioOf(run);
  const rows = (Object.keys(DEPT_NAMES) as DeptKey[]).map(d => {
    const counts: Record<TaskStatus, number> = { done: 0, open: 0, overdue: 0, planned: 0 };
    for (const t of s.tasks.filter(t => t.dept === d)) counts[taskStatus(t, run, now)]++;
    return { d, counts, total: Object.values(counts).reduce((a, b) => a + b, 0) };
  });
  const totals = rows.reduce((acc, r) => { (Object.keys(r.counts) as TaskStatus[]).forEach(k => { acc[k] += r.counts[k]; }); return acc; }, { done: 0, open: 0, overdue: 0, planned: 0 } as Record<TaskStatus, number>);
  const max = Math.max(...rows.map(r => r.total));
  const order: TaskStatus[] = ['done', 'open', 'overdue', 'planned'];
  return (
    <figure className="s-tasks" data-tour="plans-chart" aria-label="Tasks by department and status">
      <div className="s-tasks-totals">
        {order.map(k => <div key={k} className={`t-${k}`}><span className="s-label">{TASK_ICON[k]} {TASK_LABEL[k]}</span><b>{totals[k]}</b></div>)}
      </div>
      <div className="s-tasks-rows">
        {rows.map(r => (
          <div key={r.d} className="s-tasks-row">
            <span className="s-tasks-name">{DEPT_NAMES[r.d]}</span>
            <span className="s-tasks-bar" style={{ width: `${(r.total / max) * 100}%` }}>
              {order.filter(k => r.counts[k] > 0).map(k => <i key={k} className={`t-${k}`} style={{ flex: r.counts[k] }} title={`${DEPT_NAMES[r.d]}: ${r.counts[k]} ${TASK_LABEL[k].toLowerCase()}`} />)}
            </span>
            <span className="s-tasks-n s-num">{r.counts.overdue > 0 && <span className="s-crimson">{r.counts.overdue} overdue · </span>}{r.total}</span>
          </div>
        ))}
      </div>
      <figcaption className="s-legend">{order.map(k => <span key={k}><i className={`t-${k}`} />{TASK_LABEL[k]}</span>)}</figcaption>
      <details className="s-tableview"><summary>View as table</summary>
        <table className="s-table"><thead><tr><th>Department</th>{order.map(k => <th key={k}>{TASK_LABEL[k]}</th>)}<th>Total</th></tr></thead>
          <tbody>{rows.map(r => <tr key={r.d}><td>{DEPT_NAMES[r.d]}</td>{order.map(k => <td key={k} className="s-num">{r.counts[k]}</td>)}<td className="s-num">{r.total}</td></tr>)}</tbody></table>
      </details>
    </figure>
  );
}

/** Synthetic signal intensity (single series): 2px line, threshold, crosshair tooltip. */
export function Trajectory({ run }: { run: Run }) {
  const s = scenarioOf(run);
  const data = s.trajectory;
  const shown = run.status === 'ready' ? data.slice(0, 7) : data;
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  const W = 520, H = 150, P = { l: 30, r: 12, t: 12, b: 22 };
  const x = (i: number) => P.l + (i / (data.length - 1)) * (W - P.l - P.r);
  const y = (v: number) => P.t + (1 - v / 100) * (H - P.t - P.b);
  const path = shown.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join('');
  const area = `${path}L${x(shown.length - 1).toFixed(1)} ${y(0)}L${x(0)} ${y(0)}Z`;
  const onMove = (e: React.PointerEvent) => {
    const r = ref.current?.getBoundingClientRect(); if (!r) return;
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((px - P.l) / (W - P.l - P.r)) * (data.length - 1));
    setHover(i >= 0 && i < shown.length ? i : null);
  };
  return (
    <figure className="s-traj">
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Synthetic signal intensity for ${s.ref}: ${shown.length} observations, latest ${shown[shown.length - 1]} out of 100; escalation threshold 60`} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        {[0, 50, 100].map(v => <g key={v}><line x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} className="s-grid" /><text x={P.l - 6} y={y(v) + 4} className="s-axis" textAnchor="end">{v}</text></g>)}
        <line x1={P.l} x2={W - P.r} y1={y(60)} y2={y(60)} className="s-threshold" />
        <text x={W - P.r} y={y(60) - 5} className="s-axis" textAnchor="end">escalation threshold 60</text>
        <path d={area} className="s-area" />
        <path d={path} className="s-line" />
        <circle cx={x(shown.length - 1)} cy={y(shown[shown.length - 1])} r={4.5} className="s-dot" />
        {hover !== null && <g><line x1={x(hover)} x2={x(hover)} y1={P.t} y2={H - P.b} className="s-cross" /><circle cx={x(hover)} cy={y(shown[hover])} r={4.5} className="s-dot" /></g>}
        <text x={P.l} y={H - 4} className="s-axis">Observation 1</text>
        <text x={W - P.r} y={H - 4} className="s-axis" textAnchor="end">{shown.length}</text>
      </svg>
      {hover !== null && <div className="s-traj-tip" style={{ left: `${(x(hover) / W) * 100}%` }}>Obs. {hover + 1}: <b className="s-num">{shown[hover]}</b>/100</div>}
    </figure>
  );
}

export function KriMeters({ kris, tour }: { kris: Kri[]; tour?: string }) {
  return (
    <ul className="s-kris" data-tour={tour}>
      {kris.map(k => {
        const st = kriStatus(k);
        const span = k.higherIsWorse ? Math.max(k.critical * 1.25, k.value * 1.1) : 100;
        const lo = k.higherIsWorse ? 0 : Math.min(k.critical - (k.warning - k.critical) * 2, k.value - 0.2);
        const pct = Math.min(100, Math.max(3, ((k.value - lo) / (span - lo)) * 100));
        return (
          <li key={k.name}>
            <div className="s-row between"><span>{k.name}</span><span className={`s-chip ${st === 'critical' ? 'crit' : st === 'warning' ? 'warn' : 'ok'}`}>{st === 'critical' ? <CircleAlert size={13} /> : st === 'warning' ? <CircleDot size={13} /> : <CircleCheck size={13} />}{st === 'critical' ? 'Critical' : st === 'warning' ? 'Warning' : 'Normal'}</span></div>
            <div className={`s-meter ${st === 'critical' ? 'crit' : st === 'warning' ? 'warn' : ''}`} aria-hidden="true"><i style={{ width: `${pct}%` }} /></div>
            <div className="s-row between s-small"><b className="s-strong" style={{ color: 'var(--s-text)' }}>{k.value}{k.unit === '%' ? '%' : ` ${unitFor(k.unit, k.value)}`}</b><span>warning {k.higherIsWorse ? '≥' : '<'} {k.warning} · critical {k.higherIsWorse ? '≥' : '≤'} {k.critical}</span></div>
          </li>
        );
      })}
    </ul>
  );
}

export function Readiness({ run, now }: { run: Run; now: number }) {
  const rows = deptReadiness(run, now);
  return (
    <ul className="s-ready" data-tour="cmd-readiness">
      {rows.map(r => (
        <li key={r.plan.dept}>
          <div className="s-row between"><span><b>{r.plan.name.replace(' plan', '')}</b> <span className="s-small">· {r.plan.owner === 'karan' ? 'Karan' : r.plan.owner === 'vijay' ? 'Vijay' : r.plan.owner === 'vandana' ? 'Vandana' : r.plan.owner === 'nandini' ? 'Nandini' : r.plan.owner === 'srija' ? 'Srija' : 'Pavan'}</span></span><span className="s-small s-num">{r.done}/{r.total}{r.overdue ? <span className="s-crimson"> · {r.overdue} overdue</span> : ''}</span></div>
          <div className={`s-meter ${r.pct === 100 ? '' : 'active'}`} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={r.pct} aria-label={`${r.plan.name}: incident tasks complete`}><i style={{ width: `${Math.max(2, r.pct)}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}
