-- Counter short codes + the hospital's Late Morning / Late Evening shifts,
-- so an Excel duty roster that names a counter under each employee (EMG,
-- GF C, RD, 2ND, 1ST, BILL, CALL) can assign counters on import.
--
-- short_code is matched ignoring case and spaces ("GF C" = "gfc"), so the
-- unique index uses the same normalisation.
ALTER TABLE counters ADD COLUMN IF NOT EXISTS short_code VARCHAR(20);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_counters_short_code
  ON counters (UPPER(REPLACE(short_code, ' ', '')))
  WHERE short_code IS NOT NULL;

-- Shift hours per the roster legend: M 08-16, E 15-23, N 23-08.
UPDATE shifts SET start_time = '08:00', end_time = '16:00' WHERE shift_code = 'M';
UPDATE shifts SET start_time = '15:00', end_time = '23:00' WHERE shift_code = 'E';
UPDATE shifts SET start_time = '23:00', end_time = '08:00' WHERE shift_code = 'N';

INSERT INTO shifts (shift_name, start_time, end_time, shift_code, is_off) VALUES
  ('Late Morning', '10:00', '18:00', 'LM', FALSE),
  ('Late Evening', '16:00', '00:00', 'LE', FALSE)
ON CONFLICT DO NOTHING;

-- Call Center has no queue tickets (no services tagged) and shouldn't show
-- on the waiting-room display or the kiosk, so it starts inactive. The
-- roster import still assigns staff to it by its short code.
INSERT INTO counters (counter_number, counter_name, counter_name_bn, is_active, short_code)
SELECT 'CALL', 'Call Center', 'কল সেন্টার', FALSE, 'CALL'
WHERE NOT EXISTS (
        SELECT 1 FROM counters
        WHERE UPPER(REPLACE(COALESCE(short_code, ''), ' ', '')) = 'CALL'
           OR LOWER(counter_name) = 'call center'
           OR counter_number = 'CALL'
      );
