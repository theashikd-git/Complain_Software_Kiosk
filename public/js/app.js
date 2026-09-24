// ==========================================================
// "Your Opinion" kiosk
// Satisfied: emoji + 5-star rating, tapping a star submits instantly.
// Complain: emoji goes to one page with all three questions — what
//   happened, which counter(s), optional identification — and a single
//   Submit at the bottom.
//
// Complain also does "unspecified complaint" tracking: the moment the
// Complain button is tapped, a bare complaint row is created on the server
// (visible on the admin Reports page right away, even if the patient never
// finishes). If the patient goes on to actually type/record something and
// pick a counter, the final Submit fills in that SAME row rather than
// creating a second one — see openComplainScreen() and the submit handler.
// ==========================================================

const screens = {
  choice: document.getElementById('screen-choice'),
  satisfied: document.getElementById('screen-satisfied'),
  complain: document.getElementById('screen-complain'),
  serial: document.getElementById('screen-serial'),
  serialDone: document.getElementById('screen-serial-done'),
  done: document.getElementById('screen-done')
};

function showScreen(name) {
  Object.values(screens).forEach((el) => (el.hidden = true));
  screens[name].hidden = false;
}

// ---------------- STEP 1: choice ----------------
document.querySelectorAll('.choice-box').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (btn.dataset.choice === 'satisfied') {
      resetStars();
      showScreen('satisfied');
    } else {
      openComplainScreen();
    }
  });
});

document.getElementById('serial-banner-btn').addEventListener('click', () => {
  openSerialScreen();
});

// ==========================================================
// SATISFIED — star rating, tap to submit immediately
// ==========================================================
const starButtons = Array.from(document.querySelectorAll('.star-btn'));
let submittingRating = false;

function resetStars() {
  starButtons.forEach((b) => b.classList.remove('lit', 'hover-lit'));
}

function litUpTo(n) {
  starButtons.forEach((b) => {
    b.classList.toggle('hover-lit', Number(b.dataset.star) <= n);
  });
}

starButtons.forEach((btn) => {
  const n = Number(btn.dataset.star);
  btn.addEventListener('mouseenter', () => litUpTo(n));
  btn.addEventListener('mouseleave', () => litUpTo(0));
  btn.addEventListener('click', async () => {
    if (submittingRating) return;
    submittingRating = true;
    starButtons.forEach((b) => (b.classList.toggle('lit', Number(b.dataset.star) <= n)));

    try {
      const res = await fetch('/api/submissions/satisfied', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: n })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not submit rating.');
      showSatisfiedDone();
    } catch (err) {
      alert(err.message);
      submittingRating = false;
    }
  });
});

document.getElementById('back-from-satisfied').addEventListener('click', () => {
  showScreen('choice');
});

function showSatisfiedDone() {
  const doneIcon = document.getElementById('done-icon');
  const doneTitle = document.getElementById('done-title');
  const doneSub = document.getElementById('done-sub');
  doneIcon.style.background = 'var(--green-soft)';
  doneIcon.style.color = '#12805a';
  doneIcon.innerHTML = '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#12805a" stroke-width="3"><path d="M4 12l5 5L20 6"/></svg>';
  doneTitle.textContent = 'Thank you!';
  doneSub.textContent = 'We’re glad your visit went well.';
  showScreen('done');
  launchConfetti(['#12805a', '#f0a93a', '#2f5fd8', '#bfe6d3']);
  submittingRating = false;
}

// Small celebratory burst of colored pieces from the done icon — satisfied
// path only, kept out of the complaint flow so that stays low-key/respectful.
function launchConfetti(colors) {
  const host = document.getElementById('screen-done');
  const burst = document.createElement('div');
  burst.className = 'confetti-burst';
  const pieceCount = 20;
  for (let i = 0; i < pieceCount; i++) {
    const piece = document.createElement('span');
    piece.className = 'confetti-piece';
    const angle = Math.random() * Math.PI * 2;
    const distance = 60 + Math.random() * 100;
    piece.style.setProperty('--tx', `${Math.cos(angle) * distance}px`);
    piece.style.setProperty('--ty', `${Math.sin(angle) * distance - 30}px`);
    piece.style.setProperty('--rot', `${Math.round(Math.random() * 360)}deg`);
    piece.style.background = colors[i % colors.length];
    piece.style.animationDelay = `${(Math.random() * 0.12).toFixed(2)}s`;
    burst.appendChild(piece);
  }
  host.appendChild(burst);
  setTimeout(() => burst.remove(), 1400);
}

// ==========================================================
// COMPLAIN — one page, three questions
// ==========================================================
const complaintText = document.getElementById('complaint-text');
const counterGrid = document.getElementById('counter-grid');
const idTypeButtons = document.querySelectorAll('.id-type-btn');
const idValueWrap = document.getElementById('id-value-wrap');
const idValueInput = document.getElementById('id-value-input');
const complainError = document.getElementById('complain-error');
const submitBtn = document.getElementById('submit-complaint');

const complainState = {
  selectedCounterIds: new Set(),
  id_type: null,
  id_value: '',
  voiceBlob: null,
  submissionId: null // set once the "unspecified" row is created — see openComplainScreen()
};

let countersLoaded = false;

// Tapping Complain: create the "unspecified" complaint row right away (in
// the background — the patient never waits on this) and go straight to the
// complain page. Every fresh tap of Complain starts a brand new unspecified
// row, even if a previous visit to this page was abandoned without
// submitting — abandoned ones just stay in Reports as-is, which is the
// point (staff can see someone was upset even if they didn't finish).
function openComplainScreen() {
  complainState.submissionId = null;
  showScreen('complain');
  if (!countersLoaded) loadCountersIntoScreen();
  startUnspecifiedComplaint();
}

async function startUnspecifiedComplaint() {
  try {
    const res = await fetch('/api/submissions/complain/start', { method: 'POST' });
    const data = await res.json();
    if (res.ok && data.submission_id) {
      complainState.submissionId = data.submission_id;
    }
    // If this fails, submissionId just stays null and the final Submit
    // below falls back to creating a fresh row from scratch — the patient
    // never sees this fail, and nothing about finishing the complaint
    // depends on it having worked.
  } catch (err) {
    // Network hiccup — silently fall back, as above.
  }
}

document.getElementById('back-from-complain').addEventListener('click', () => {
  showScreen('choice');
  hideKeyboard();
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!screens.complain.hidden || !screens.serial.hidden) {
    showScreen('choice');
    hideKeyboard();
  }
});

// ---- What happened ----
complaintText.setAttribute('inputmode', 'none'); // ask mobile/touch OSes to suppress their own keyboard, since we supply ours
complaintText.addEventListener('focus', () => showKeyboard(complaintText));
complaintText.addEventListener('input', () => autoGrowTextarea(complaintText));

// Grows the complaint box with what's typed (up to a cap, then it scrolls
// internally) so the text already written stays visible instead of being
// hidden a few lines up in a fixed-height box.
function autoGrowTextarea(el) {
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
}

// ---- Which counter(s) ----
async function loadCountersIntoScreen() {
  try {
    const res = await fetch('/api/counters');
    const counters = await res.json();
    counterGrid.innerHTML = '';
    if (!counters.length) {
      counterGrid.innerHTML = '<div class="counter-empty">No counters have been set up yet. Please ask a staff member for help.</div>';
      return;
    }
    counters.forEach((c) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'counter-btn';
      btn.innerHTML = `<span>${escapeHtml(c.counter_number)}</span><span class="counter-name">${escapeHtml(c.counter_name)}</span>`;
      btn.addEventListener('click', () => {
        if (complainState.selectedCounterIds.has(c.id)) {
          complainState.selectedCounterIds.delete(c.id);
          btn.classList.remove('selected');
        } else {
          complainState.selectedCounterIds.add(c.id);
          btn.classList.add('selected');
        }
      });
      counterGrid.appendChild(btn);
    });
    countersLoaded = true;
  } catch (err) {
    counterGrid.innerHTML = '<div class="counter-empty">Could not load counters. Please check your connection.</div>';
  }
}

// ---- How should we identify you (optional) ----
// Tapping the selected type again clears it.
idTypeButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    if (complainState.id_type === btn.dataset.idtype) {
      clearIdentification();
      return;
    }
    idTypeButtons.forEach((b) => b.classList.remove('selected'));
    btn.classList.add('selected');
    complainState.id_type = btn.dataset.idtype;
    const idValueLabel = document.getElementById('id-value-label');
    idValueLabel.textContent = `Enter ${complainState.id_type}`;
    idValueInput.placeholder = complainState.id_type === 'Patient Name' ? 'Full name' : `e.g. ${complainState.id_type.split(' ')[0]}-2026-00123`;
    idValueWrap.hidden = false;
    idValueInput.value = '';
    idValueInput.focus();
  });
});

document.getElementById('id-clear').addEventListener('click', clearIdentification);

function clearIdentification() {
  idTypeButtons.forEach((b) => b.classList.remove('selected'));
  idValueWrap.hidden = true;
  idValueInput.value = '';
  complainState.id_type = null;
  complainState.id_value = '';
}

idValueInput.setAttribute('inputmode', 'none');
idValueInput.addEventListener('focus', () => showKeyboard(idValueInput));
idValueInput.addEventListener('input', () => {
  complainState.id_value = idValueInput.value;
});

// Voice recording
const voiceBtn = document.getElementById('voice-btn');
const voiceBtnLabel = document.getElementById('voice-btn-label');
const voicePreview = document.getElementById('voice-preview');
const voiceClearBtn = document.getElementById('voice-clear');

let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;

voiceBtn.addEventListener('click', async () => {
  if (!isRecording) {
    // getUserMedia only exists in a "secure context" — https://, or the
    // browser opened directly on http://localhost / http://127.0.0.1. If
    // this kiosk is being reached over the LAN via a plain http://<ip>:3000
    // address, the browser hides the whole mediaDevices API and this is
    // why voice recording silently can't start.
    if (!window.isSecureContext) {
      showComplainError('Voice recording needs a secure connection. It works at http://localhost on this machine, but not over a plain http://<ip> LAN address — ask staff to set up HTTPS for kiosk devices, or type the complaint instead.');
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showComplainError('Voice recording isn’t supported in this browser. You can still type your complaint.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordedChunks = [];
      mediaRecorder = new MediaRecorder(stream);
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunks.push(e.data);
      };
      mediaRecorder.onstop = () => {
        complainState.voiceBlob = new Blob(recordedChunks, { type: 'audio/webm' });
        voicePreview.src = URL.createObjectURL(complainState.voiceBlob);
        voicePreview.hidden = false;
        voiceClearBtn.hidden = false;
        stream.getTracks().forEach((t) => t.stop());
      };
      mediaRecorder.start();
      isRecording = true;
      voiceBtn.classList.add('recording');
      voiceBtnLabel.textContent = 'Tap to stop recording';
    } catch (err) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        showComplainError('Microphone access was denied. Please allow the microphone permission for this page (check the address bar) and try again.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        showComplainError('No microphone was found on this device. You can still type your complaint.');
      } else if (err.name === 'NotReadableError') {
        showComplainError('The microphone is already in use by another app. Close it and try again.');
      } else {
        showComplainError(`Could not start voice recording: ${err.message}. You can still type your complaint.`);
      }
    }
  } else {
    mediaRecorder.stop();
    isRecording = false;
    voiceBtn.classList.remove('recording');
    voiceBtnLabel.textContent = 'Record voice complaint';
  }
});

voiceClearBtn.addEventListener('click', () => {
  complainState.voiceBlob = null;
  voicePreview.hidden = true;
  voiceClearBtn.hidden = true;
  voicePreview.src = '';
});

function showComplainError(msg) {
  complainError.textContent = msg;
  complainError.hidden = false;
}

// Submit
submitBtn.addEventListener('click', async () => {
  complainError.hidden = true;

  const text = complaintText.value.trim();
  if (!text && !complainState.voiceBlob) {
    showComplainError('Please tell us what happened, in text or voice.');
    return;
  }
  if (complainState.selectedCounterIds.size === 0) {
    showComplainError('Please select at least one counter you visited.');
    return;
  }
  if (!complainState.id_type || !complainState.id_value.trim()) {
    showComplainError('Please tell us how to identify you — pick one option below and enter it.');
    return;
  }

  submitBtn.disabled = true;

  try {
    const formData = new FormData();
    formData.append('complaint_text', text);
    formData.append('counter_ids', JSON.stringify([...complainState.selectedCounterIds]));
    formData.append('id_type', complainState.id_type);
    formData.append('id_value', complainState.id_value.trim());
    if (complainState.voiceBlob) {
      formData.append('voice', complainState.voiceBlob, 'complaint.webm');
    }
    // If the "unspecified" row from openComplainScreen() was created
    // successfully, this tells the server to fill in THAT row instead of
    // creating a second one. If it's missing (the earlier background call
    // failed), the server just creates a fresh row as a fallback.
    if (complainState.submissionId) {
      formData.append('submission_id', complainState.submissionId);
    }

    const res = await fetch('/api/submissions/complain', { method: 'POST', body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Submission failed.');

    hideKeyboard();
    showComplainDone();
    resetComplainForm();
  } catch (err) {
    showComplainError(err.message);
  } finally {
    submitBtn.disabled = false;
  }
});

function showComplainDone() {
  const doneIcon = document.getElementById('done-icon');
  const doneTitle = document.getElementById('done-title');
  const doneSub = document.getElementById('done-sub');
  doneIcon.style.background = 'var(--red-soft)';
  doneIcon.style.color = '#bf3327';
  doneIcon.innerHTML = '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#bf3327" stroke-width="3"><path d="M4 12l5 5L20 6"/></svg>';
  doneTitle.textContent = 'Complaint received';
  doneSub.textContent = 'Thank you for letting us know. We will look into this.';
  showScreen('done');
}

function resetComplainForm() {
  complaintText.value = '';
  complaintText.style.height = ''; // undo auto-grow
  complainState.selectedCounterIds.clear();
  document.querySelectorAll('.counter-btn.selected').forEach((c) => c.classList.remove('selected'));
  clearIdentification();
  complainState.voiceBlob = null;
  complainState.submissionId = null;
  voicePreview.hidden = true;
  voiceClearBtn.hidden = true;
  voicePreview.src = '';
  complainError.hidden = true;
  hideKeyboard();
}

// ---------------- Start over ----------------
document.getElementById('start-over').addEventListener('click', () => {
  resetStars();
  submittingRating = false;
  showScreen('choice');
});

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ==========================================================
// GET A SERIAL NUMBER — turns the kiosk into a simple queue-management
// tool alongside its feedback/complaint role. The patient picks a
// SERVICE, not a counter (single-select — a ticket is for one purpose)
// — the server decides which counter actually serves it (whichever
// eligible counter currently has the fewest people waiting), so the
// same screen naturally spreads load across counters and lets a
// counter absorb another service's overflow when it's idle. See
// POST /api/queue/ticket in src/routes/public.js for that logic.
// ==========================================================
const serialServiceGrid = document.getElementById('serial-service-grid');
const serialError = document.getElementById('serial-error');
const getSerialBtn = document.getElementById('get-serial-btn');

let selectedServiceId = null;
let serialServicesLoaded = false;

function openSerialScreen() {
  selectedServiceId = null;
  serialServiceGrid.querySelectorAll('.id-type-btn.selected').forEach((b) => b.classList.remove('selected'));
  getSerialBtn.disabled = true;
  serialError.hidden = true;
  showScreen('serial');
  if (!serialServicesLoaded) loadServicesIntoSerialScreen();
}

document.getElementById('back-from-serial').addEventListener('click', () => {
  showScreen('choice');
});

async function loadServicesIntoSerialScreen() {
  try {
    const res = await fetch('/api/services');
    const services = await res.json();
    serialServiceGrid.innerHTML = '';
    if (!services.length) {
      serialServiceGrid.innerHTML = '<div class="counter-empty">No services have been set up yet. Please ask a staff member for help.</div>';
      return;
    }
    services.forEach((s) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'id-type-btn';
      btn.textContent = s.service_name;
      btn.addEventListener('click', () => {
        selectedServiceId = s.id;
        serialServiceGrid.querySelectorAll('.id-type-btn.selected').forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
        getSerialBtn.disabled = false;
        serialError.hidden = true;
      });
      serialServiceGrid.appendChild(btn);
    });
    serialServicesLoaded = true;
  } catch (err) {
    serialServiceGrid.innerHTML = '<div class="counter-empty">Could not load services. Please check your connection.</div>';
  }
}

function showSerialDone(data) {
  document.getElementById('serial-ticket-number').textContent = data.ticket_number;
  document.getElementById('serial-ticket-counter').textContent = `${data.counter_name} · ${data.service_name}`;
  showScreen('serialDone');
}

getSerialBtn.addEventListener('click', async () => {
  if (!selectedServiceId) {
    serialError.textContent = 'Please select a service first.';
    serialError.hidden = false;
    return;
  }
  serialError.hidden = true;
  getSerialBtn.disabled = true;

  try {
    const res = await fetch('/api/queue/ticket', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service_id: selectedServiceId })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not get a number right now. Please try again.');
    showSerialDone(data);
  } catch (err) {
    serialError.textContent = err.message;
    serialError.hidden = false;
    getSerialBtn.disabled = false;
  }
});

document.getElementById('serial-start-over').addEventListener('click', () => {
  showScreen('choice');
});

// ==========================================================
// ON-SCREEN KEYBOARD — English (QWERTY, letters + symbols layer) and
// Bangla (vowels, vowel-signs/kar, consonants, digits — conjuncts are
// built by tapping the hasant ্ between two consonants, same as any
// standard Bangla layout). Shown automatically for the complaint text
// box and the identification value field, since kiosk devices may have
// no physical keyboard attached.
// ==========================================================
const osk = document.getElementById('osk');
const oskKeysEl = document.getElementById('osk-keys');
const oskDoneBtn = document.getElementById('osk-done');
const oskLangButtons = document.querySelectorAll('.osk-lang-btn');

let oskTarget = null;
let oskLang = 'en';
let oskShift = false;
let oskLayer = 'letters'; // english only: 'letters' | 'symbols'

const EN_LETTERS = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['shift', 'z', 'x', 'c', 'v', 'b', 'n', 'm', 'backspace'],
  ['symbols', ',', 'space', '.', 'enter']
];
const EN_SYMBOLS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['-', '/', ':', ';', '(', ')', '&', '@', '"', "'"],
  ['!', '?', '#', '%', '+', '=', '_', 'backspace'],
  ['letters', ',', 'space', '.', 'enter']
];
// Two layers, same idea as English's letters/symbols split, so the default
// view stays compact (6 rows: vowels, vowel-signs, then consonants — the
// three things you interleave constantly while typing Bangla). Digits and
// the handful of rarer marks live behind "১২৩" instead of bloating every
// keystroke's view.
const BN_LETTERS = [
  ['অ', 'আ', 'ই', 'ঈ', 'উ', 'ঊ', 'ঋ', 'এ', 'ঐ', 'ও', 'ঔ'],
  ['া', 'ি', 'ী', 'ু', 'ূ', 'ৃ', 'ে', 'ৈ', 'ো', 'ৌ', '্'],
  ['ক', 'খ', 'গ', 'ঘ', 'ঙ', 'চ', 'ছ', 'জ', 'ঝ', 'ঞ', 'ট'],
  ['ঠ', 'ড', 'ঢ', 'ণ', 'ত', 'থ', 'দ', 'ধ', 'ন', 'প', 'ফ'],
  ['ব', 'ভ', 'ম', 'য', 'র', 'ল', 'শ', 'ষ', 'স', 'হ', 'backspace'],
  ['more', ',', 'space', '।', 'enter']
];
const BN_MORE = [
  ['১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯', '০'],
  ['ড়', 'ঢ়', 'য়', 'ৎ', 'ং', 'ঃ', 'ঁ', 'backspace'],
  ['letters', ',', 'space', '.', 'enter']
];

function oskCurrentRows() {
  if (oskLang === 'bn') return oskLayer === 'more' ? BN_MORE : BN_LETTERS;
  return oskLayer === 'symbols' ? EN_SYMBOLS : EN_LETTERS;
}

function renderKeyboard() {
  const rows = oskCurrentRows();
  oskKeysEl.innerHTML = '';
  rows.forEach((row) => {
    const rowEl = document.createElement('div');
    rowEl.className = 'osk-row';
    row.forEach((key) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.key = key;
      let label = key;
      let extraClass = '';
      if (key === 'space') { label = ''; extraClass = 'space func'; }
      else if (key === 'backspace') { label = '⌫'; extraClass = 'func'; }
      else if (key === 'enter') { label = '↵'; extraClass = 'wide func'; }
      else if (key === 'shift') { label = '⇧'; extraClass = 'func' + (oskShift ? ' active' : ''); }
      else if (key === 'symbols') { label = '123'; extraClass = 'wide func'; }
      else if (key === 'more') { label = '১২৩'; extraClass = 'wide func'; }
      else if (key === 'letters') { label = oskLang === 'bn' ? 'বাংলা' : 'ABC'; extraClass = 'wide func'; }
      else if (oskLang === 'en' && oskShift) { label = key.toUpperCase(); }
      btn.textContent = label;
      btn.className = `osk-key ${extraClass}`.trim();
      rowEl.appendChild(btn);
    });
    oskKeysEl.appendChild(rowEl);
  });
}

function oskInsert(el, text) {
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  el.value = el.value.slice(0, start) + text + el.value.slice(end);
  const pos = start + text.length;
  el.setSelectionRange(pos, pos);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function oskBackspace(el) {
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  if (start === end) {
    if (start === 0) return;
    el.value = el.value.slice(0, start - 1) + el.value.slice(end);
    el.setSelectionRange(start - 1, start - 1);
  } else {
    el.value = el.value.slice(0, start) + el.value.slice(end);
    el.setSelectionRange(start, start);
  }
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

// Tapping a key would normally blur the focused field first (losing the
// cursor position) — block that on mousedown/touchstart so focus stays on
// the field, and act only on the click that follows.
oskKeysEl.addEventListener('mousedown', (e) => e.preventDefault());
oskKeysEl.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });

oskKeysEl.addEventListener('click', (e) => {
  const btn = e.target.closest('.osk-key');
  if (!btn || !oskTarget) return;
  const key = btn.dataset.key;

  if (key === 'shift') {
    oskShift = !oskShift;
    renderKeyboard();
    return;
  }
  if (key === 'symbols' || key === 'letters' || key === 'more') {
    oskLayer = key;
    renderKeyboard();
    return;
  }
  if (key === 'backspace') {
    oskBackspace(oskTarget);
    return;
  }
  if (key === 'space') {
    oskInsert(oskTarget, ' ');
    return;
  }
  if (key === 'enter') {
    if (oskTarget.tagName === 'TEXTAREA') {
      oskInsert(oskTarget, '\n');
    } else {
      hideKeyboard();
    }
    return;
  }

  let char = key;
  if (oskLang === 'en' && oskShift) {
    char = key.toUpperCase();
    oskShift = false;
    renderKeyboard();
  }
  oskInsert(oskTarget, char);
});

oskLangButtons.forEach((btn) => {
  btn.addEventListener('mousedown', (e) => e.preventDefault());
  btn.addEventListener('click', () => {
    oskLang = btn.dataset.lang;
    oskLayer = 'letters';
    oskShift = false;
    oskLangButtons.forEach((b) => b.classList.toggle('active', b === btn));
    osk.classList.toggle('lang-bn', oskLang === 'bn'); // Bangla uses slightly shorter keys — see CSS
    renderKeyboard();
    if (oskTarget) oskTarget.focus();
  });
});

oskDoneBtn.addEventListener('mousedown', (e) => e.preventDefault());
oskDoneBtn.addEventListener('click', hideKeyboard);

function activeScreenEl() {
  return document.querySelector('.screen:not([hidden])');
}

function showKeyboard(target) {
  oskTarget = target;
  osk.hidden = false;
  renderKeyboard();
  // Reserve extra room at the bottom of whichever step is showing, so
  // there's actually somewhere to scroll the focused field up to —
  // otherwise a field near the bottom would stay stuck behind the fixed
  // keyboard with nowhere left to go.
  const active = activeScreenEl();
  if (active) active.classList.add('keyboard-open');
  // The keyboard covers the bottom of the screen and there's no mouse to
  // scroll with, so make sure the field being typed into is still visible
  // above it once the slide-up animation settles.
  setTimeout(() => {
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, 220);
}
function hideKeyboard() {
  osk.hidden = true;
  oskTarget = null;
  document.querySelectorAll('.screen.keyboard-open').forEach((el) => el.classList.remove('keyboard-open'));
}
