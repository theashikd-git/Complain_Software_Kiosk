// Public waiting-room queue display — view only, no login, no
// interaction. Polls GET /api/queue/display on a timer and re-renders;
// there is no click/tap handling anywhere on this page by design.
//
// Bangla is the default (matches the hospital's other patient-facing
// screens); the board alternates to English on a fixed timer so it
// also serves English-speaking patients, then switches back. Ticket
// numbers and admin-entered names (counter/service names) are never
// translated — only the screen's own labels are.

const POLL_INTERVAL_MS = 4000;
const LANG_SWITCH_INTERVAL_MS = 10000; // how long each language stays on screen

const LANGS = ['bn', 'en'];
let langIndex = 0;
let currentLang = LANGS[langIndex];

const STRINGS = {
  bn: {
    headerTitle: 'Queens Hospital — সিরিয়াল নম্বর',
    nowServing: 'এখন চলছে',
    nobodyServing: 'কেউ নেই',
    waitingPanelTitle: (n) => `অপেক্ষমান তালিকা (${n})`,
    nobodyWaitingAnywhere: 'কোথাও কেউ অপেক্ষা করছে না।',
    more: (n) => `+${n} আরও`,
    noActiveCounters: 'কোনো সক্রিয় কাউন্টার নেই।',
    loadError: (msg) => `লোড করা যায়নি: ${msg}`,
    clockLocale: 'bn-BD'
  },
  en: {
    headerTitle: 'Queens Hospital — Serial Number Display',
    nowServing: 'Now Serving',
    nobodyServing: 'No one',
    waitingPanelTitle: (n) => `Waiting List (${n})`,
    nobodyWaitingAnywhere: 'Nobody waiting anywhere.',
    more: (n) => `+${n} more`,
    noActiveCounters: 'No active counters.',
    loadError: (msg) => `Could not load: ${msg}`,
    clockLocale: 'en-US'
  }
};

function t(key, ...args) {
  const entry = STRINGS[currentLang][key];
  return typeof entry === 'function' ? entry(...args) : entry;
}

const grid = document.getElementById('board-grid');
const clockEl = document.getElementById('board-clock');
const titleEl = document.getElementById('board-title');
const waitingPanelLabelEl = document.getElementById('waiting-panel-label');
const waitingGroupsEl = document.getElementById('waiting-groups');

// Tracks the last-seen "serving" ticket id per counter, purely to
// detect a change between polls and flash the number that changed —
// never used for anything else.
let lastServingByCounter = {};
// Last successful fetch, kept so a language switch can re-render
// instantly without waiting for (or forcing) another network request.
let lastCounters = [];

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : str;
  return div.innerHTML;
}

function updateClock() {
  clockEl.textContent = new Date().toLocaleTimeString(t('clockLocale'), { hour: '2-digit', minute: '2-digit' });
}

function counterCardHtml(c) {
  const hasServing = Boolean(c.serving);
  const servingNumber = hasServing ? c.serving.display_number : '—';
  const servingService = hasServing ? c.serving.service_name : t('nobodyServing');

  return `
    <div class="counter-card" data-counter-id="${c.counter_id}">
      <p class="counter-name">${escapeHtml(c.counter_number)} — ${escapeHtml(c.counter_name)}</p>
      <div class="now-serving">
        <p class="now-serving-label">${escapeHtml(t('nowServing'))}</p>
        <p class="now-serving-number${hasServing ? '' : ' is-empty'}">${escapeHtml(servingNumber)}</p>
        <p class="now-serving-service">${escapeHtml(servingService)}</p>
      </div>
    </div>
  `;
}

// One card shared by every counter, instead of a waiting list nested in
// each counter card — the room can scan the whole wait at once instead
// of hunting through separate cards for the one that's moving. Each
// chip keeps the full ticket number exactly as printed on the patient's
// slip ("01-002"), plus a small "C{n}" tag calling out which counter
// line to join — spelled out separately rather than making patients
// parse the counter number back out of the hyphenated ticket number.
function waitingChipHtml(ticket) {
  const counterTag = `C${parseInt(ticket.counter_number, 10)}`;
  return `<span class="waiting-chip">
    <span class="waiting-chip-number">${escapeHtml(ticket.display_number)}</span>
    <span class="waiting-chip-divider"></span>
    <span class="waiting-chip-counter">${escapeHtml(counterTag)}</span>
  </span>`;
}

function buildWaitingChipsHtml(allWaiting, shownCount) {
  const shown = allWaiting.slice(0, shownCount);
  const extraCount = allWaiting.length - shown.length;
  return shown.map(waitingChipHtml).join('')
    + (extraCount > 0 ? `<span class="waiting-chip waiting-chip-more">${escapeHtml(t('more', extraCount))}</span>` : '');
}

function renderWaitingPanel(counters) {
  const allWaiting = counters.flatMap((c) => c.waiting.map((ticket) => ({ ...ticket, counter_number: c.counter_number })));
  waitingPanelLabelEl.textContent = t('waitingPanelTitle', allWaiting.length);

  if (!allWaiting.length) {
    waitingGroupsEl.innerHTML = `<p class="waiting-panel-empty">${escapeHtml(t('nobodyWaitingAnywhere'))}</p>`;
    return;
  }

  // Numbers this large don't all fit at once once the queue gets long.
  // Rather than guess a fixed cap, render everything, then drop tickets
  // from the tail (folding them into "+N more") until the chips actually
  // fit the card's real height — so the "+N more" chip itself is never
  // the thing that gets clipped off invisibly.
  let shownCount = allWaiting.length;
  waitingGroupsEl.innerHTML = `<div class="waiting-chips">${buildWaitingChipsHtml(allWaiting, shownCount)}</div>`;
  const chipsEl = waitingGroupsEl.querySelector('.waiting-chips');
  while (shownCount > 0 && chipsEl.scrollHeight > waitingGroupsEl.clientHeight) {
    shownCount -= 1;
    chipsEl.innerHTML = buildWaitingChipsHtml(allWaiting, shownCount);
  }
}

function render(counters) {
  if (!counters.length) {
    grid.innerHTML = `<p class="board-loading">${escapeHtml(t('noActiveCounters'))}</p>`;
    waitingPanelLabelEl.textContent = t('waitingPanelTitle', 0);
    waitingGroupsEl.innerHTML = '';
    return;
  }

  grid.innerHTML = counters.map(counterCardHtml).join('');
  renderWaitingPanel(counters);

  // Queue a voice announcement for whichever counter's "now serving"
  // ticket id changed since the last poll — skipped on the very first
  // render (nothing to compare against yet) so the board doesn't
  // announce everything on load, and harmless on a pure language-switch
  // re-render, since the ticket ids haven't changed there. The actual
  // card flash is triggered from announceJob() instead of here, so the
  // glow and the voice always happen at the same moment even when
  // several counters change at once and get announced one after another.
  counters.forEach((c) => {
    const currentId = c.serving ? c.serving.ticket_id : null;
    const previousId = lastServingByCounter[c.counter_id];
    if (previousId !== undefined && currentId !== previousId && currentId !== null) {
      enqueueAnnouncement({
        counterId: c.counter_id,
        serialText: c.serving.display_number,
        counterTag: parseInt(c.counter_number, 10)
      });
    }
    lastServingByCounter[c.counter_id] = currentId;
  });
}

// ----------------------------------------------------------------
// Voice announcements — plays a chime + spoken "Serial N, Counter M"
// whenever a counter's Now Serving number changes. Runs entirely in
// the browser via the Web Speech API (no server, no audio files).
// Announcements are queued and played one at a time, never overlapped,
// so two counters updating together are still heard as two separate,
// intelligible announcements rather than talking over each other.
// ----------------------------------------------------------------
let audioCtx = null;
let soundEnabled = false;
const announceQueue = [];
let isAnnouncing = false;

function ensureAudioContext() {
  if (audioCtx) return audioCtx;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    audioCtx = Ctx ? new Ctx() : null;
  } catch (err) {
    audioCtx = null;
  }
  return audioCtx;
}

// A short, gentle two-note chime synthesized on the fly — no audio
// asset to ship or fail to load. Resolves once it has finished playing
// so the queue can wait for it before starting the voice.
function playChime() {
  return new Promise((resolve) => {
    const ctx = ensureAudioContext();
    if (!ctx) { resolve(); return; }
    try {
      const now = ctx.currentTime;
      const notes = [880, 1108.73]; // A5 -> C#6, a soft "ding-dong"
      const noteLength = 0.35;
      const noteGap = 0.22;
      notes.forEach((freq, i) => {
        const start = now + i * noteGap;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.22, start + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, start + noteLength);
        osc.connect(gain).connect(ctx.destination);
        osc.start(start);
        osc.stop(start + noteLength + 0.05);
      });
      setTimeout(resolve, (notes.length - 1) * noteGap * 1000 + noteLength * 1000 + 100);
    } catch (err) {
      resolve();
    }
  });
}

// The Web Speech API has no standard gender field on a voice, so
// picking a "female" voice is a best-effort name match against the
// installed voice's label. Covers: Chrome's network Bangla voice
// (female by default), Windows' bn-IN/bn-BD neural voices, and the
// common Windows/desktop English voices, since a Bangla voice may not
// be installed and the announcement falls back to English.
const FEMALE_VOICE_NAME_HINTS = [
  'female',
  'google বাংলা', 'google bangla',
  'tanishaa', 'nabanita', // Windows bn-IN / bn-BD neural voices
  'zira', 'hazel', 'susan', 'catherine', 'heera', // older Windows desktop voices
  'aria', 'jenny', 'michelle', 'sonia', 'libby', 'natasha', // newer Windows neural voices
  'samantha', 'karen', 'moira', 'tessa', 'fiona', 'veena', // macOS/other common voices
  'salli', 'joanna', 'kendra', 'kimberly', 'amy', 'emma', 'ivy', 'ruth'
];
const MALE_VOICE_NAME_HINTS = [
  'male', 'david', 'mark', 'george', 'james', 'ravi', 'guy', 'alex',
  'bashkar', 'pradeep', 'daniel', 'matthew', 'brian', 'justin', 'joey', 'russell'
];

function isLikelyFemaleVoiceName(name) {
  const n = (name || '').toLowerCase();
  if (MALE_VOICE_NAME_HINTS.some((hint) => n.includes(hint))) return false;
  return FEMALE_VOICE_NAME_HINTS.some((hint) => n.includes(hint));
}

function pickVoiceForLangPrefix(prefix) {
  if (!window.speechSynthesis) return null;
  const voices = (window.speechSynthesis.getVoices() || []).filter(
    (v) => v.lang && v.lang.toLowerCase().startsWith(prefix)
  );
  if (!voices.length) return null;
  return voices.find((v) => isLikelyFemaleVoiceName(v.name)) || voices[0];
}

function speakOnce(text, lang, voice) {
  return new Promise((resolve) => {
    if (!window.speechSynthesis) { resolve(); return; }
    try {
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = lang;
      if (voice) utter.voice = voice;
      // A measured, waiting-room pace — slower than default conversational speed.
      utter.rate = 0.82;
      utter.pitch = 1;
      utter.onend = resolve;
      utter.onerror = resolve;
      window.speechSynthesis.speak(utter);
    } catch (err) {
      resolve();
    }
  });
}

// Builds the spoken line in a given language. Numbers are passed as
// plain numerals — a language-matched voice (bn-BD / en-US) reads them
// as normal spoken numbers ("চৌদ্দ", "fourteen"), not digit-by-digit.
function buildAnnouncementText(serialText, counterTag, lang) {
  if (lang === 'bn') {
    return { text: `সিরিয়াল ${serialText}, কাউন্টার ${counterTag}-এ আসুন।`, ttsLang: 'bn-BD' };
  }
  return { text: `Serial number ${serialText}, please proceed to counter ${counterTag}.`, ttsLang: 'en-US' };
}

function flashCounterCard(counterId) {
  // Re-queried at play time rather than captured once, since the grid
  // gets rebuilt on every poll and the node from when this was queued
  // may no longer exist.
  const card = grid.querySelector(`.counter-card[data-counter-id="${counterId}"] .now-serving`);
  if (card) {
    card.classList.add('just-changed');
    setTimeout(() => card.classList.remove('just-changed'), 1800);
  }
}

async function announceJob(job) {
  // The flash and the chime fire together, right as this specific
  // announcement starts — not when the change was first detected —
  // so a counter's glow always lines up with its own voice call, even
  // when several are queued back to back.
  flashCounterCard(job.counterId);

  let { text, ttsLang } = buildAnnouncementText(job.serialText, job.counterTag, currentLang);
  let voice = pickVoiceForLangPrefix(currentLang === 'bn' ? 'bn' : 'en');

  // No Bangla voice installed on this device — read the numbers in
  // English rather than mispronouncing or staying silent.
  if (currentLang === 'bn' && !voice) {
    const fallback = buildAnnouncementText(job.serialText, job.counterTag, 'en');
    text = fallback.text;
    ttsLang = fallback.ttsLang;
    voice = pickVoiceForLangPrefix('en');
  }

  try {
    await playChime();
    // Said twice, with a short pause, so anyone who looks up late still
    // catches the number.
    await speakOnce(text, ttsLang, voice);
    await new Promise((resolve) => setTimeout(resolve, 500));
    await speakOnce(text, ttsLang, voice);
  } catch (err) {
    // Speech failing for any reason must never disrupt the display —
    // this is a silent, best-effort feature, not a required one.
  }
}

async function processAnnounceQueue() {
  if (isAnnouncing) return;
  isAnnouncing = true;
  while (announceQueue.length) {
    const job = announceQueue.shift();
    await announceJob(job);
  }
  isAnnouncing = false;
}

function enqueueAnnouncement(job) {
  announceQueue.push(job);
  if (soundEnabled) processAnnounceQueue();
}

function enableSound() {
  if (soundEnabled) return;
  soundEnabled = true;
  const ctx = ensureAudioContext();
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  // Speaking a near-silent utterance inside this click handler unlocks
  // speechSynthesis on browsers that otherwise require a user gesture
  // before any voice output is allowed.
  if (window.speechSynthesis) {
    try {
      const unlock = new SpeechSynthesisUtterance(' ');
      unlock.volume = 0;
      window.speechSynthesis.speak(unlock);
    } catch (err) { /* ignore */ }
  }
  if (soundOverlay) soundOverlay.remove();
  processAnnounceQueue();
}

const soundOverlay = document.getElementById('sound-unlock-overlay');
// ?sound=auto is an explicit setup flag for a device that's been put
// into a kiosk/autoplay-allowed browser mode ahead of time (a browser
// launch flag or OS-level kiosk policy) — it skips the tap prompt
// entirely. Everywhere else, sound stays off until a staff member taps
// once, since browsers otherwise block audio a visitor never triggered.
if (new URLSearchParams(location.search).get('sound') === 'auto') {
  enableSound();
} else if (soundOverlay) {
  soundOverlay.addEventListener('click', enableSound, { once: true });
}
if (window.speechSynthesis) {
  window.speechSynthesis.getVoices(); // warm the voice list up early
}

async function loadQueue() {
  try {
    const res = await fetch('/api/queue/display');
    const counters = await res.json();
    if (!res.ok) throw new Error(counters.error || 'Could not load the queue.');
    lastCounters = counters;
    render(counters);
  } catch (err) {
    grid.innerHTML = `<p class="board-loading">${escapeHtml(t('loadError', err.message))}</p>`;
  }
}

function applyLanguage() {
  document.documentElement.lang = currentLang;
  titleEl.textContent = t('headerTitle');
  updateClock();
  render(lastCounters);
}

function switchLanguage() {
  langIndex = (langIndex + 1) % LANGS.length;
  currentLang = LANGS[langIndex];
  applyLanguage();
}

// Sets the title/clock in the default language without touching the
// grid — avoids a flash of "no active counters" before the first
// loadQueue() response arrives (unlike applyLanguage(), which also
// re-renders the grid from lastCounters and is only safe to call once
// real data has been fetched at least once).
document.documentElement.lang = currentLang;
titleEl.textContent = t('headerTitle');
updateClock();
setInterval(updateClock, 1000 * 15);
loadQueue();
setInterval(loadQueue, POLL_INTERVAL_MS);
setInterval(switchLanguage, LANG_SWITCH_INTERVAL_MS);
