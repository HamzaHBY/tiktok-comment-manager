'use strict';

const express = require('express');

function buildCommentsRouter({ accountStore, jobStore, scheduler, tiktokClient }) {
  const router = express.Router();

  router.post('/', async (req, res, next) => {
    try {
      const { videoUrl, comment, accountId, scheduleAt } = req.body || {};
      if (!videoUrl || typeof videoUrl !== 'string') {
        return res.status(400).json({ error: 'videoUrl is required' });
      }
      if (!comment || typeof comment !== 'string') {
        return res.status(400).json({ error: 'comment is required' });
      }
      if (!accountId || typeof accountId !== 'string') {
        return res.status(400).json({ error: 'accountId is required' });
      }

      const account = await accountStore.getByIdForUser(accountId, req.user.id);
      if (!account) {
        return res.status(404).json({ error: 'Account not found' });
      }

      let runAt;
      let status;
      if (scheduleAt) {
        const ts = new Date(scheduleAt);
        if (isNaN(ts.getTime())) {
          return res
            .status(400)
            .json({ error: 'scheduleAt must be a valid ISO 8601 date' });
        }
        runAt = ts.toISOString();
        status = ts.getTime() <= Date.now() ? 'pending' : 'scheduled';
      } else {
        runAt = new Date().toISOString();
        status = 'pending';
      }

      const job = await jobStore.create({
        userId: req.user.id,
        accountId,
        accountOpenId: account.openId,
        accountDisplayName: account.displayName || null,
        videoUrl,
        comment,
        runAt,
        status,
      });

      if (!scheduleAt || new Date(scheduleAt).getTime() <= Date.now()) {
        const finished = await scheduler.runJob(job.id);
        return res.status(finished && finished.status === 'success' ? 200 : 202).json({ job: finished });
      }

      res.status(202).json({ job });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { buildCommentsRouter };
