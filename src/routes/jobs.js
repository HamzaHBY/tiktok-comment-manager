'use strict';

const express = require('express');

function buildJobsRouter({ jobStore, scheduler }) {
  const router = express.Router();

  router.get('/', async (req, res, next) => {
    try {
      const jobs = await jobStore.list();
      res.json({ jobs });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/clear', async (req, res, next) => {
    try {
      const cleared = await jobStore.clear();
      res.json({ ok: true, cleared });
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/cancel', async (req, res, next) => {
    try {
      const job = await scheduler.cancelJob(req.params.id);
      if (!job) return res.status(404).json({ error: 'Job not found' });
      res.json({ job });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { buildJobsRouter };
