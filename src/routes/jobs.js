'use strict';

const express = require('express');

function buildJobsRouter({ jobStore, scheduler }) {
  const router = express.Router();

  router.get('/', async (req, res, next) => {
    try {
      const jobs = await jobStore.listForUser(req.user.id);
      res.json({ jobs });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/clear', async (req, res, next) => {
    try {
      const cleared = await jobStore.clearForUser(req.user.id);
      res.json({ ok: true, cleared });
    } catch (err) {
      next(err);
    }
  });

  router.post('/:id/cancel', async (req, res, next) => {
    try {
      const owned = await jobStore.getByIdForUser(req.params.id, req.user.id);
      if (!owned) return res.status(404).json({ error: 'Job not found' });
      const job = await scheduler.cancelJob(req.params.id);
      res.json({ job });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { buildJobsRouter };
