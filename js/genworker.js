import { runJob } from './genworker-core.js';

self.onmessage = (e) => {
  const { id, msg } = e.data;
  try {
    self.postMessage({ id, result: runJob(msg) });
  } catch (err) {
    self.postMessage({ id, error: String(err && err.message ? err.message : err) });
  }
};
