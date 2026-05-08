'use strict';

const cron = require('node-cron');

class CommentScheduler {
  constructor({ jobStore, tiktokClient, tickExpression = '* * * * *' }) {
    this.jobStore = jobStore;
    this.tiktokClient = tiktokClient;
    this.tickExpression = tickExpression;
    this._task = null;
    this._running = false;
  }

  start() {
    if (this._task) return;
    this._task = cron.schedule(this.tickExpression, () => {
      this.tick().catch((err) => {
        console.error('[scheduler] tick failed:', err);
      });
    });
  }

  stop() {
    if (this._task) {
      this._task.stop();
      this._task = null;
    }
  }

  async tick() {
    if (this._running) return;
    this._running = true;
    try {
      const all = await this.jobStore.list();
      const now = Date.now();
      const due = all.filter(
        (j) =>
          (j.status === 'scheduled' || j.status === 'pending') &&
          j.runAt &&
          new Date(j.runAt).getTime() <= now
      );
      for (const job of due) {
        await this.runJob(job.id);
      }
    } finally {
      this._running = false;
    }
  }

  async runJob(jobId) {
    const job = await this.jobStore.getById(jobId);
    if (!job) return null;
    if (job.status !== 'pending' && job.status !== 'scheduled') return job;

    await this.jobStore.update(jobId, {
      status: 'running',
      startedAt: new Date().toISOString(),
    });

    try {
      const { videoId, result } = await this.tiktokClient.publishComment({
        accountId: job.accountId,
        videoUrl: job.videoUrl,
        text: job.comment,
      });
      return await this.jobStore.update(jobId, {
        status: 'success',
        videoId,
        result,
        completedAt: new Date().toISOString(),
        error: null,
      });
    } catch (err) {
      return await this.jobStore.update(jobId, {
        status: 'failed',
        error: {
          message: err.message,
          status: err.status || null,
          body: err.body || null,
        },
        completedAt: new Date().toISOString(),
      });
    }
  }

  async cancelJob(jobId) {
    const job = await this.jobStore.getById(jobId);
    if (!job) return null;
    if (job.status !== 'pending' && job.status !== 'scheduled') return job;
    return this.jobStore.update(jobId, {
      status: 'cancelled',
      cancelledAt: new Date().toISOString(),
    });
  }
}

module.exports = { CommentScheduler };
