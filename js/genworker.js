import { runJob } from './genworker-core.js';

self.onmessage = (e) => {
  const { id, msg } = e.data;
  self.postMessage({ id, result: runJob(msg) });
};
