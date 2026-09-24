const express = require('express');
const router = express.Router();
const db = require('../../config/db');
const { getQueueSnapshot } = require('../../utils/queueSnapshot');
const { callNextForCounter } = require('../../utils/callNext');

// GET /api/admin/queue — today's live waiting/serving tickets for every
// active counter, for the admin "Queue" (Now Serving) page. A counter's
// waiting list can include tickets for more than one service — e.g. the
// Report Delivery counter's list can show overflowed OPD tickets mixed
// in with its own — since a physical counter serves whatever it's been
// tagged for (see counter_services), not one fixed service.
router.get('/', async (req, res) => {
  try {
    res.json(await getQueueSnapshot(db));
  } catch (err) {
    console.error('Error fetching queue:', err);
    res.status(500).json({ error: 'Could not load the queue.' });
  }
});

// POST /api/admin/queue/:counterId/call-next — marks whichever ticket is
// currently "serving" at this counter as served, then promotes the
// oldest still-"waiting" ticket (by ticket_number) to "serving". Returns
// the newly-serving ticket, or null if nobody is waiting.
router.post('/:counterId/call-next', async (req, res) => {
  try {
    const nextTicket = await callNextForCounter(db, req.params.counterId);
    res.json({ success: true, next_ticket: nextTicket });
  } catch (err) {
    console.error('Error calling next ticket:', err);
    res.status(500).json({ error: 'Could not call the next ticket.' });
  }
});

module.exports = router;
