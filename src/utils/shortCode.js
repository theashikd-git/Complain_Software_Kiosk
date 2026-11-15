// Counter short codes ("GF C", "EMG") as typed by an admin or found in an
// Excel roster. Stored trimmed and upper-cased; compared with all
// whitespace removed so "GF C", "GFC" and "gf c" are the same code.
function cleanShortCode(value) {
  const s = String(value ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
  return s || null;
}

function shortCodeKey(value) {
  return String(value ?? '').replace(/\s+/g, '').toUpperCase();
}

module.exports = { cleanShortCode, shortCodeKey };
