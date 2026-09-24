// Public-facing API — no login needed. Used by the "Your Opinion" kiosk screen.
const express = require('express');
const router = express.Router();
const db = require('../config/db');
const upload = require('../config/upload');
const { getEffectiveAssignments } = require('../utils/liveAssignment');
const { printTicket } = require('../utils/receiptPrinter');
const { getQueueSnapshot } = require('../utils/queueSnapshot');

const VALID_ID_TYPES = ['OPD ID', 'IPD ID', 'DIAG ID', 'Patient Name'];

// GET /api/counters — list active counters (used by the complaint popup's
// multi-select counter list)
router.get('/counters', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT id, counter_number, counter_name FROM counters WHERE is_active = TRUE ORDER BY counter_number'
    );
    res.json(rows);
  } catch (err) {
    console.error('Error fetching counters:', err);
    res.status(500).json({ error: 'Could not load counters.' });
  }
});

// POST /api/submissions/satisfied — tapping a star submits immediately.
// No counter, no identification, just the 1-5 rating.
router.post('/submissions/satisfied', async (req, res) => {
  try {
    const rating = Number(req.body.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be a whole number from 1 to 5.' });
    }

    const { rows } = await db.query(
      `INSERT INTO submissions (submission_type, rating) VALUES ('satisfied', $1) RETURNING id`,
      [rating]
    );

    res.status(201).json({ success: true, submission_id: rows[0].id });
  } catch (err) {
    console.error('Error saving satisfied submission:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// POST /api/submissions/complain/start — creates a bare "unspecified"
// complaint row the instant the patient taps the Complain button on the
// kiosk, so it shows up on the admin Reports page right away even if they
// never finish the form (staff can see someone was upset even without
// details). If the patient does go on to finish (text/voice + a counter),
// POST /api/submissions/complain below fills in THIS row via submission_id
// instead of creating a second one for the same visit.
router.post('/submissions/complain/start', async (req, res) => {
  try {
    const { rows } = await db.query(
      `INSERT INTO submissions (submission_type) VALUES ('complain') RETURNING id`
    );
    res.status(201).json({ submission_id: rows[0].id });
  } catch (err) {
    console.error('Error starting complaint:', err);
    res.status(500).json({ error: 'Could not start complaint.' });
  }
});

// POST /api/submissions/complain — the complaint page: text/voice complaint,
// one or more counters (required), identification (required — one of the 4
// id_type options, with a value).
// Accepts an optional `submission_id` (from the /start call above) — when
// present and valid, this fills in that existing "unspecified" row instead
// of creating a new one. When absent, invalid, or already claimed, it just
// creates a fresh row, exactly like before this feature existed.
router.post('/submissions/complain', upload.single('voice'), async (req, res) => {
  const client = await db.connect();
  try {
    const { complaint_text, id_type, id_value } = req.body;
    const requestedSubmissionId = Number(req.body.submission_id);

    // counter_ids arrives as a JSON string (multi-select) via FormData.
    let counterIds = [];
    try {
      counterIds = JSON.parse(req.body.counter_ids || '[]');
    } catch {
      counterIds = [];
    }
    counterIds = [...new Set(counterIds.map(Number).filter((n) => Number.isInteger(n) && n > 0))];

    // --- validation ---
    if (!complaint_text?.trim() && !req.file) {
      return res.status(400).json({ error: 'Please tell us what happened, in text or voice.' });
    }
    if (counterIds.length === 0) {
      return res.status(400).json({ error: 'Please select at least one counter you visited.' });
    }
    // Identification is required: one of the 4 types, with a value.
    if (!id_type || !id_value?.trim()) {
      return res.status(400).json({ error: 'Please tell us how to identify you — pick one option and enter it.' });
    }
    if (!VALID_ID_TYPES.includes(id_type)) {
      return res.status(400).json({ error: 'Invalid identification type.' });
    }

    const voiceFilePath = req.file ? `/uploads/voice/${req.file.filename}` : null;

    await client.query('BEGIN');

    // If a valid, still-unspecified "start" row was passed in, fill it in
    // rather than creating a second submission for the same kiosk visit.
    let submissionId = null;
    if (Number.isInteger(requestedSubmissionId) && requestedSubmissionId > 0) {
      const { rows: updated } = await client.query(
        `UPDATE submissions
         SET id_type = $1, id_value = $2, complaint_text = $3, voice_file_path = $4
         WHERE id = $5 AND submission_type = 'complain'
         RETURNING id`,
        [id_type || null, id_value?.trim() || null, complaint_text?.trim() || null, voiceFilePath, requestedSubmissionId]
      );
      if (updated.length) {
        submissionId = updated[0].id;
        // Defensive only — the "start" row should never already have
        // counters linked, but clear any out just in case this ever runs
        // twice for the same submission_id, so we don't hit the unique
        // constraint or leave stale links behind.
        await client.query('DELETE FROM submission_counters WHERE submission_id = $1', [submissionId]);
      }
    }
    if (submissionId === null) {
      const { rows: inserted } = await client.query(
        `INSERT INTO submissions
          (submission_type, id_type, id_value, complaint_text, voice_file_path)
         VALUES ('complain', $1, $2, $3, $4) RETURNING id`,
        [
          id_type || null,
          id_value?.trim() || null,
          complaint_text?.trim() || null,
          voiceFilePath
        ]
      );
      submissionId = inserted[0].id;
    }

    // Verify the counters are real, active rows before linking (defends
    // against a stale/tampered counter_ids list from the client).
    const { rows: validCounters } = await client.query(
      'SELECT id FROM counters WHERE id = ANY($1::int[]) AND is_active = TRUE',
      [counterIds]
    );
    if (validCounters.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Selected counter(s) are no longer valid.' });
    }

    // Pull each counter's CURRENT effective employee — whoever's roster
    // shift covers right now, falling back to the counter's manual default
    // if no shift is currently active. This is the one and only moment that
    // value is read for this complaint: it gets copied into
    // submission_counters.assigned_employee_id as a frozen snapshot below, so
    // reassigning the counter (or the roster moving on to the next shift)
    // later never changes who this complaint says was responsible.
    const validCounterIds = validCounters.map((c) => c.id);
    const assignments = await getEffectiveAssignments(client, validCounterIds);

    // Bulk-link every valid counter in one statement via unnest() over two
    // parallel arrays (counter_id, that counter's employee snapshot).
    await client.query(
      `INSERT INTO submission_counters (submission_id, counter_id, assigned_employee_id)
       SELECT $1, t.counter_id, t.employee_id
       FROM unnest($2::int[], $3::int[]) AS t(counter_id, employee_id)`,
      [
        submissionId,
        validCounterIds,
        validCounterIds.map((id) => (assignments[id] ? assignments[id].employeeId : null))
      ]
    );

    await client.query('COMMIT');
    res.status(201).json({ success: true, submission_id: submissionId });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error saving complaint:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  } finally {
    client.release();
  }
});

// GET /api/services — list active services (used by the kiosk's "Get a
// Serial Number" screen — the patient picks a service, not a counter).
router.get('/services', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT id, service_name FROM services WHERE is_active = TRUE ORDER BY service_name'
    );
    res.json(rows);
  } catch (err) {
    console.error('Error fetching services:', err);
    res.status(500).json({ error: 'Could not load services.' });
  }
});

// POST /api/queue/ticket — issue the next serial/queue number for a
// requested SERVICE (the patient never picks a counter — see the kiosk's
// "Get a Serial Number" screen). The counter is chosen automatically:
// among every active counter tagged with this service (counter_services,
// set from the admin Counters page), whichever currently has the fewest
// people waiting gets it.
//
// That single rule does two jobs at once:
//   - spreads load round-robin-style across counters that share a service
//   - lets a counter "absorb" another service's overflow when it's idle
//     (e.g. tagging the Report Delivery counter with OPD and Diagnostic
//     too lets it pick up OPD tickets whenever OPD's own counter is
//     busier) — with no special-case code here; it falls out entirely of
//     which counters an admin tagged for the service.
//
// Ticket numbers come from one shared, strictly increasing sequence for
// the whole hospital (daily_ticket_sequence), not counted up per
// counter — so the same number is never issued twice in a day no matter
// which counter issues it, and a plain number alone is enough to
// identify a ticket.
router.post('/queue/ticket', async (req, res) => {
  const client = await db.connect();
  try {
    const serviceId = Number(req.body.service_id);
    if (!Number.isInteger(serviceId) || serviceId <= 0) {
      return res.status(400).json({ error: 'Please select a service.' });
    }

    const { rows: serviceRows } = await client.query(
      'SELECT id, service_name FROM services WHERE id = $1 AND is_active = TRUE',
      [serviceId]
    );
    if (serviceRows.length === 0) {
      return res.status(400).json({ error: 'Selected service is no longer available.' });
    }
    const service = serviceRows[0];

    await client.query('BEGIN');

    const { rows: eligible } = await client.query(
      `SELECT c.id, c.counter_number, c.counter_name,
              COALESCE(wc.waiting_count, 0) AS waiting_count
       FROM counters c
       JOIN counter_services cs ON cs.counter_id = c.id
       LEFT JOIN (
         SELECT counter_id, COUNT(*) AS waiting_count
         FROM queue_tickets
         WHERE status = 'waiting' AND ticket_date = CURRENT_DATE
         GROUP BY counter_id
       ) wc ON wc.counter_id = c.id
       WHERE cs.service_id = $1 AND c.is_active = TRUE
       ORDER BY waiting_count ASC, c.id ASC
       LIMIT 1`,
      [serviceId]
    );

    if (eligible.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'No counter currently offers this service. Please ask a staff member for help.' });
    }
    const counter = eligible[0];

    // One shared, strictly increasing sequence for the whole hospital —
    // whichever counter issues the next ticket gets the next number,
    // atomically, via the same INSERT ... ON CONFLICT DO UPDATE pattern
    // each counter used to use on its own. Keyed only by ticket_date
    // (not counter_id), so every counter draws from the same sequence
    // instead of each starting back at 1.
    const { rows: sequenceRows } = await client.query(
      `INSERT INTO daily_ticket_sequence (ticket_date, last_number)
       VALUES (CURRENT_DATE, 1)
       ON CONFLICT (ticket_date)
       DO UPDATE SET last_number = daily_ticket_sequence.last_number + 1, updated_at = CURRENT_TIMESTAMP
       RETURNING last_number`
    );
    const number = sequenceRows[0].last_number;

    await client.query(
      `INSERT INTO queue_tickets (counter_id, service_id, ticket_date, ticket_number, status)
       VALUES ($1, $2, CURRENT_DATE, $3, 'waiting')`,
      [counter.id, serviceId, number]
    );

    await client.query('COMMIT');

    const displayTicketNumber = `${number}`;

    // Fire-and-forget — printTicket() catches its own errors (unreachable
    // printer, not configured, etc.), so a printing problem never affects
    // the ticket that's already been issued and committed above.
    printTicket({
      ticketNumber: displayTicketNumber,
      counterName: counter.counter_name,
      serviceName: service.service_name
    });

    res.status(201).json({
      ticket_number: displayTicketNumber,
      number,
      counter_id: counter.id,
      counter_number: counter.counter_number,
      counter_name: counter.counter_name,
      service_id: service.id,
      service_name: service.service_name
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error issuing queue ticket:', err);
    res.status(500).json({ error: 'Could not get a number right now. Please try again.' });
  } finally {
    client.release();
  }
});

// GET /api/queue/display — today's live waiting/serving tickets for
// every active counter, for the public waiting-room display board
// (public/display.html). No login required — this is meant to run
// full-screen on a wall-mounted monitor, polled every few seconds.
// Deliberately the same shape as GET /api/admin/queue (both call
// getQueueSnapshot) and deliberately exposes nothing beyond serial
// numbers, counter names, and service names — no patient-identifying
// information ever passes through here.
router.get('/queue/display', async (req, res) => {
  try {
    res.json(await getQueueSnapshot(db));
  } catch (err) {
    console.error('Error fetching queue display:', err);
    res.status(500).json({ error: 'Could not load the queue.' });
  }
});

module.exports = router;
