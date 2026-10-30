// Runs daily-challenge and endless-chunk generation off the main thread (falls back to the main
// thread when module workers are unavailable).

export class GenClient {
  constructor() {
    this.pending = new Map();
    this.seq = 0;
    this.worker = null;
    try {
      this.worker = new Worker(new URL('./genworker.js', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e) => this.settle(e.data.id, e.data.result);
      this.worker.onerror = () => this.fallBack();
    } catch {
      this.worker = null;
    }
  }

  settle(id, result) {
    const p = this.pending.get(id);
    if (!p) return;
    this.pending.delete(id);
    p.resolve(result);
  }

  fallBack() {
    if (this.worker) this.worker.terminate();
    this.worker = null;
    for (const [id, p] of this.pending) this.runLocal(id, p.msg);
  }

  async runLocal(id, msg) {
    const { runJob } = await import('./genworker-core.js');
    await new Promise((r) => setTimeout(r, 0));
    this.settle(id, runJob(msg));
  }

  request(msg) {
    const id = ++this.seq;
    return new Promise((resolve) => {
      this.pending.set(id, { resolve, msg });
      if (this.worker) this.worker.postMessage({ id, msg });
      else this.runLocal(id, msg);
    });
  }

  daily(dateKey) {
    return this.request({ type: 'daily', dateKey });
  }

  endless(seed, chunk, start) {
    return this.request({ type: 'endless', seed, chunk, start });
  }
}
