import { endlessChunk, generateDaily } from './levels.js';

/** Execute one generation job (shared by the worker and the main-thread fallback). */
export function runJob(msg) {
  if (msg.type === 'daily') return generateDaily(msg.dateKey);
  if (msg.type === 'endless') return endlessChunk(msg.seed, msg.chunk, msg.start);
  throw new Error(`unknown job ${msg.type}`);
}
