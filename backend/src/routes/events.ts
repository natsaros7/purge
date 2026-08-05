import { Router, Request, Response } from 'express';
import { bus } from '../bus.js';
import type { PurgeEvent } from '../types.js';

export const eventsRouter = Router();

eventsRouter.get('/', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (event: PurgeEvent) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  // Replay the current in-progress phase so a refreshed client catches up.
  if (bus.lastPhaseEvent) send(bus.lastPhaseEvent);

  bus.on('purge', send);

  req.on('close', () => {
    bus.off('purge', send);
    res.end();
  });
});
