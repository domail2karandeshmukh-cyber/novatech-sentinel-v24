import { useState } from 'react';
import { CircleAlert, CircleCheck, CircleDot, Clock3, Undo2 } from 'lucide-react';
import { useStore } from '../state/store';
import { scenarioOf, taskDueLabel, taskStatus } from '../engine/incident';
import type { TaskStatus } from '../engine/incident';
import { DEPT_NAMES } from '../data/scenarios';
import { TaskStatusChart } from '../components/Charts';
import { Avatar, PersonTag, Sim, personMeta, useNow } from '../components/kit';
import { ScenarioPicker } from '../components/Incident';
import { RaciMatrix } from './Team';

const ICON: Record<TaskStatus, JSX.Element> = { done: <CircleCheck size={14} />, open: <Clock3 size={14} />, overdue: <CircleAlert size={14} />, planned: <CircleDot size={14} /> };
const LABEL: Record<TaskStatus, string> = { done: 'Done', open: 'Open', overdue: 'Overdue', planned: 'Planned' };

export default function Response() {
  const run = useStore(s => s.run);
  const now = useNow(5000);
  const s = scenarioOf(run);
  const [filter, setFilter] = useState<TaskStatus | 'all'>('all');
  return (
    <div className="s-page">
      <div className="s-pagehead">
        <div><h1 className="s-h1">Department action plans</h1><p className="s-lead" style={{ marginTop: 8 }}>Every department has its own plan for <span className="s-mono">{s.ref}</span>: a person, a task, a due time, the evidence expected and how to roll back. Plans change with the scenario.</p></div>
        <Sim large />
      </div>
      {run.status === 'ready' && <section className="s-panel" style={{ marginBottom: 16 }}><span className="s-label">Scenario</span><ScenarioPicker current={run.scenarioId} /></section>}
      <section className="s-panel" style={{ marginBottom: 16 }}>
        <div className="s-panel-head"><div><h2 className="s-h3">Open, completed and overdue</h2><p className="s-small" style={{ margin: '3px 0 0' }}>Incident tasks complete as their gate is sealed; the backlog existed before the incident</p></div></div>
        <TaskStatusChart run={run} now={now} />
      </section>
      <div className="s-row wrap" style={{ marginBottom: 12 }} role="group" aria-label="Filter tasks">
        <div className="s-seg">{(['all', 'overdue', 'open', 'done', 'planned'] as const).map(f => <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>{f === 'all' ? 'All tasks' : LABEL[f]}</button>)}</div>
      </div>
      <div className="s-plans" data-tour="plans-grid">
        {s.plans.map(p => {
          const tasks = s.tasks.filter(t => t.dept === p.dept).map(t => ({ t, st: taskStatus(t, run, now) })).filter(x => filter === 'all' || x.st === filter);
          return (
            <section key={p.dept} className="s-panel s-plan" aria-labelledby={`plan-${p.dept}`}>
              <div className="s-plan-head">
                <h2 id={`plan-${p.dept}`} className="s-h3">{DEPT_NAMES[p.dept]}</h2>
                <div className="s-row" style={{ gap: 8 }}><PersonTag id={p.owner} sub={`Owner${p.accountable !== p.owner ? ` · accountable: ${personMeta(p.accountable).name}` : ' · accountable'}`} /></div>
                <p className="s-small" style={{ margin: 0 }}><b>Objective:</b> {p.objective}</p>
              </div>
              <ul className="s-tasklist">
                {tasks.length === 0 && <li className="s-small">No {filter === 'all' ? '' : LABEL[filter as TaskStatus].toLowerCase()} tasks.</li>}
                {tasks.map(({ t, st }) => (
                  <li key={t.id} className={`st-${st}`}>
                    <span className={`s-task-st t-${st}`} title={LABEL[st]}>{ICON[st]}<span className="s-sr">{LABEL[st]}</span></span>
                    <span className="s-task-t"><b>{t.title}</b><small><Avatar id={t.owner} size="sm" /> {personMeta(t.owner).name} · {taskDueLabel(t, run, now)} · evidence: {t.evidence}{!t.doneAt && !t.followUp ? ' · backlog' : t.followUp ? ' · follow-up' : ''}</small></span>
                  </li>
                ))}
              </ul>
              <p className="s-small s-plan-rb"><Undo2 size={13} /> Rollback: {p.rollback}</p>
            </section>
          );
        })}
      </div>
      <section className="s-panel" style={{ marginTop: 16 }} data-tour="plans-raci">
        <div className="s-panel-head"><div><h2 className="s-h3">RACI · {s.ref}</h2><p className="s-small" style={{ margin: '3px 0 0' }}>One Accountable per activity</p></div></div>
        <RaciMatrix scenarioId={s.id} />
      </section>
    </div>
  );
}
