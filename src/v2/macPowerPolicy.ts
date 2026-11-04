import type { DemoRun, Role } from './demoEngine';

export function canRequestMacShutdown(run: DemoRun, role: Role): boolean {
  return run.status === 'closed' && run.scenarioId === 'ransomware' && role === 'IT Operations' &&
    run.events.some(event => event.stage === 'authorise' && event.kind === 'approval') &&
    run.events.some(event => event.stage === 'contain' && event.kind === 'action') &&
    run.events.some(event => event.stage === 'verify' && event.kind === 'action') &&
    run.events.some(event => event.stage === 'close' && event.kind === 'closure');
}
