import { endlessChunk, generateDaily, generateHunt, generateWeekly } from './levels.js';

/** Execute one generation job (shared by the worker and the main-thread fallback). */
export function runJob(msg) {
  if (msg.type === 'daily') return generateDaily(msg.dateKey);
  if (msg.type === 'weekly') return generateWeekly(msg.weekKey, msg.stage);
  if (msg.type === 'hunt') return generateHunt(msg.dateKey);
  if (msg.type === 'endless') return endlessChunk(msg.seed, msg.chunk, msg.start, msg.zen);
  throw new Error(`unknown job ${msg.type}`);
}
