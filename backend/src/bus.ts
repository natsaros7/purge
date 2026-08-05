import { EventEmitter } from 'node:events';
import type { PurgeEvent } from './types.js';

// Phases that mean the engine is still active; cleared on COMPLETE/FAILED.
const TERMINAL_PHASES = new Set(['COMPLETE', 'FAILED']);

class PurgeBus extends EventEmitter {
  lastPhaseEvent: PurgeEvent | null = null;

  emit(event: 'purge', data: PurgeEvent): boolean;
  emit(event: string, ...args: unknown[]): boolean {
    return super.emit(event, ...args);
  }

  broadcast(event: PurgeEvent): void {
    if (TERMINAL_PHASES.has(event.phase)) {
      this.lastPhaseEvent = null;
    } else {
      this.lastPhaseEvent = event;
    }
    this.emit('purge', event);
  }
}

export const bus = new PurgeBus();
export let isRunning = false;
export function setRunning(val: boolean): void {
  isRunning = val;
}
