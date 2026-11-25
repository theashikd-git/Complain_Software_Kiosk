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

// ==========================================================
// UI LANGUAGE (বাংলা / English) — Bangla is the default on every fresh
// kiosk session; a patient's explicit choice is remembered in
// localStorage for next time. This is separate from the on-screen
// keyboard's own EN/বাংলা toggle further down, which only controls what
// characters typing produces. Counter names, service names, and the
// id_type values sent to the server stay in their original English/
// admin-entered form regardless of UI language — only this screen's own
// chrome (titles, labels, placeholders, messages) is translated.
// ==========================================================
const toBnDigits = (n) => String(n).replace(/\d/g, (d) => '০১২৩৪৫৬৭৮৯'[d]);

const I18N = {
  en: {
    docTitle: 'Your Opinion',
    opinionTitle: 'Your Opinion',
    opinionSub: 'Tell us how your visit went today',
    choiceSatisfiedLabel: 'Satisfied',
    choiceComplainLabel: 'Complain',
    tapHint: 'Tap to continue',
    serialBannerLabel: 'Get a Serial Number',
    backLabel: 'Back',
    nextLabel: 'Next',
    stepOf: (n, total) => `Step ${n} of ${total}`,
    phHint: 'Type the sound in English letters, e.g. ami',
    voiceListening: 'Listening… please speak. Your words appear in the box above.',
    voiceTextHint: 'The text above came from your voice — please check it and fix any mistakes.',
    voiceSttFailed: 'Could not turn your voice into text (the internet may be down). Your recording is still being saved — you can also type.',
    satisfiedTitle: 'Glad to hear it!',
    satisfiedSub: 'Tap a star to rate your visit',
    complainTitle: 'Tell us what happened',
    whatHappenedTitle: 'What happened?',
    complaintPlaceholder: 'Type your complaint here...',
    voiceRecordLabel: 'Record voice complaint',
    voiceStopLabel: 'Tap to stop recording',
    voiceRemoveLabel: 'Remove recording',
    counterTitle: 'Which counter did you visit?',
    counterHint: 'Select one or more',
    counterLoading: 'Loading counters...',
    counterEmpty: 'No counters have been set up yet. Please ask a staff member for help.',
    counterError: 'Could not load counters. Please check your connection.',
    idTitle: 'How should we identify you?',
    idOpd: 'OPD ID',
    idIpd: 'IPD ID',
    idDiag: 'DIAG ID',
    idName: 'Patient Name',
    idClear: 'Clear',
    enterValueDefault: 'Enter value',
    enterValueFor: (type) => `Enter ${type}`,
    placeholderFullName: 'Full name',
    placeholderIdExample: (code) => `e.g. ${code}`,
    submitLabel: 'Submit',
    startOverLabel: 'Start Over',
    serialTitle: 'Get a Serial Number',
    serialSub: 'Select the service you need',
    serialLoading: 'Loading services...',
    serialEmpty: 'No services have been set up yet. Please ask a staff member for help.',
    serialLoadError: 'Could not load services. Please check your connection.',
    getMyNumberLabel: 'Get My Number',
    ticketEyebrow: 'Your number is',
    ticketHint: 'Please wait to be called. Keep this number in mind.',
    errNoText: 'Please tell us what happened, in text or voice.',
    errStillRecording: 'Please stop the recording first — tap the red button.',
    errNoCounter: 'Please select at least one counter you visited.',
    errNoId: 'Please tell us how to identify you — pick one option below and enter it.',
    errNoRating: 'Please tap a star to rate your visit.',
    errNoService: 'Please select a service first.',
    errVoiceSecure: 'Voice recording needs a secure connection. It works at http://localhost on this machine, but not over a plain http://<ip> LAN address — ask staff to set up HTTPS for kiosk devices, or type the complaint instead.',
    errVoiceUnsupported: 'Voice recording isn’t supported in this browser. You can still type your complaint.',
    errMicDenied: 'Microphone access was denied. Please allow the microphone permission for this page (check the address bar) and try again.',
    errMicMissing: 'No microphone was found on this device. You can still type your complaint.',
    errMicBusy: 'The microphone is already in use by another app. Close it and try again.',
    errVoiceGeneric: (msg) => `Could not start voice recording: ${msg}. You can still type your complaint.`,
    errSubmitFailed: 'Submission failed.',
    errRatingFailed: 'Could not submit rating.',
    errTicketFailed: 'Could not get a number right now. Please try again.',
    doneSatisfiedTitle: 'Thank you!',
    doneSatisfiedSub: 'We’re glad your visit went well.',
    doneComplainTitle: 'Complaint received',
    doneComplainSub: 'Thank you for letting us know. We will look into this.'
  },
  bn: {
    docTitle: 'আপনার মতামত',
    opinionTitle: 'আপনার মতামত',
    opinionSub: 'আজ আপনার ভিজিট কেমন হয়েছে আমাদের জানান',
    choiceSatisfiedLabel: 'সন্তুষ্ট',
    choiceComplainLabel: 'অভিযোগ',
    tapHint: 'চালিয়ে যেতে চাপুন',
    serialBannerLabel: 'সিরিয়াল নম্বর নিন',
    backLabel: 'ফিরে যান',
    nextLabel: 'পরবর্তী',
    stepOf: (n, total) => `ধাপ ${toBnDigits(n)}/${toBnDigits(total)}`,
    phHint: 'ইংরেজি অক্ষরে উচ্চারণ লিখুন, যেমন: ami',
    voiceListening: 'শুনছি… আপনার কথা বলুন। আপনার কথা ওপরের বক্সে লেখা হবে।',
    voiceTextHint: 'ওপরের লেখাটি আপনার কথা থেকে তৈরি — দেখে নিন এবং ভুল থাকলে ঠিক করে দিন।',
    voiceSttFailed: 'আপনার কথা লেখায় রূপান্তর করা যায়নি (ইন্টারনেট বন্ধ থাকতে পারে)। আপনার রেকর্ডিং ঠিকই সংরক্ষণ হচ্ছে — আপনি টাইপও করতে পারেন।',
    satisfiedTitle: 'শুনে ভালো লাগলো!',
    satisfiedSub: 'রেটিং দিতে একটি স্টারে চাপুন',
    complainTitle: 'কী ঘটেছে আমাদের জানান',
    whatHappenedTitle: 'কী ঘটেছে?',
    complaintPlaceholder: 'এখানে আপনার অভিযোগ লিখুন...',
    voiceRecordLabel: 'ভয়েস অভিযোগ রেকর্ড করুন',
    voiceStopLabel: 'রেকর্ডিং বন্ধ করতে চাপুন',
    voiceRemoveLabel: 'রেকর্ডিং মুছে ফেলুন',
    counterTitle: 'আপনি কোন কাউন্টারে গিয়েছিলেন?',
    counterHint: 'একটি বা একাধিক নির্বাচন করুন',
    counterLoading: 'কাউন্টার লোড হচ্ছে...',
    counterEmpty: 'এখনও কোনো কাউন্টার সেট আপ করা হয়নি। অনুগ্রহ করে একজন স্টাফের সাহায্য নিন।',
    counterError: 'কাউন্টার লোড করা যায়নি। অনুগ্রহ করে আপনার সংযোগ পরীক্ষা করুন।',
    idTitle: 'আমরা কীভাবে আপনাকে সনাক্ত করব?',
    idOpd: 'ওপিডি আইডি',
    idIpd: 'আইপিডি আইডি',
    idDiag: 'ডায়াগ আইডি',
    idName: 'রোগীর নাম',
    idClear: 'মুছুন',
    enterValueDefault: 'মান লিখুন',
    enterValueFor: (type) => `${type} লিখুন`,
    placeholderFullName: 'পূর্ণ নাম',
    placeholderIdExample: (code) => `যেমন ${code}`,
    submitLabel: 'জমা দিন',
    startOverLabel: 'আবার শুরু করুন',
    serialTitle: 'সিরিয়াল নম্বর নিন',
    serialSub: 'আপনার প্রয়োজনীয় সেবা নির্বাচন করুন',
    serialLoading: 'সেবা লোড হচ্ছে...',
    serialEmpty: 'এখনও কোনো সেবা সেট আপ করা হয়নি। অনুগ্রহ করে একজন স্টাফের সাহায্য নিন।',
    serialLoadError: 'সেবা লোড করা যায়নি। অনুগ্রহ করে আপনার সংযোগ পরীক্ষা করুন।',
    getMyNumberLabel: 'আমার নম্বর নিন',
    ticketEyebrow: 'আপনার নম্বর হলো',
    ticketHint: 'ডাকার জন্য অপেক্ষা করুন। এই নম্বরটি মনে রাখুন।',
    errNoText: 'অনুগ্রহ করে কী ঘটেছে তা লিখে অথবা ভয়েসে জানান।',
    errStillRecording: 'অনুগ্রহ করে আগে রেকর্ডিং বন্ধ করুন — লাল বাটনে চাপুন।',
    errNoCounter: 'অনুগ্রহ করে আপনি যে কাউন্টারে গিয়েছিলেন তা নির্বাচন করুন।',
    errNoId: 'অনুগ্রহ করে আমাদের জানান কীভাবে আপনাকে সনাক্ত করা যাবে — নিচে থেকে একটি অপশন বেছে তথ্য দিন।',
    errNoRating: 'অনুগ্রহ করে আপনার ভিজিট রেট করতে একটি স্টারে চাপুন।',
    errNoService: 'অনুগ্রহ করে প্রথমে একটি সেবা নির্বাচন করুন।',
    errVoiceSecure: 'ভয়েস রেকর্ডিংয়ের জন্য একটি নিরাপদ সংযোগ প্রয়োজন। এটি এই ডিভাইসে http://localhost-এ কাজ করে, কিন্তু সাধারণ http://<ip> ল্যান ঠিকানায় কাজ করে না — কিয়স্ক ডিভাইসের জন্য HTTPS সেট আপ করতে স্টাফকে বলুন, অথবা অভিযোগটি টাইপ করুন।',
    errVoiceUnsupported: 'এই ব্রাউজারে ভয়েস রেকর্ডিং সমর্থিত নয়। আপনি এখনও আপনার অভিযোগ টাইপ করতে পারেন।',
    errMicDenied: 'মাইক্রোফোন অ্যাক্সেস প্রত্যাখ্যান করা হয়েছে। অনুগ্রহ করে এই পৃষ্ঠার জন্য মাইক্রোফোন অনুমতি দিন (ঠিকানা বার দেখুন) এবং আবার চেষ্টা করুন।',
    errMicMissing: 'এই ডিভাইসে কোনো মাইক্রোফোন পাওয়া যায়নি। আপনি এখনও আপনার অভিযোগ টাইপ করতে পারেন।',
    errMicBusy: 'মাইক্রোফোনটি ইতিমধ্যে অন্য একটি অ্যাপ ব্যবহার করছে। এটি বন্ধ করে আবার চেষ্টা করুন।',
    errVoiceGeneric: (msg) => `ভয়েস রেকর্ডিং শুরু করা যায়নি: ${msg}। আপনি এখনও আপনার অভিযোগ টাইপ করতে পারেন।`,
    errSubmitFailed: 'জমা দেওয়া ব্যর্থ হয়েছে।',
    errRatingFailed: 'রেটিং জমা দেওয়া যায়নি।',
    errTicketFailed: 'এই মুহূর্তে নম্বর দেওয়া যায়নি। আবার চেষ্টা করুন।',
    doneSatisfiedTitle: 'ধন্যবাদ!',
    doneSatisfiedSub: 'আপনার ভিজিট ভালো হয়েছে জেনে আমরা আনন্দিত।',
    doneComplainTitle: 'অভিযোগ গৃহীত হয়েছে',
    doneComplainSub: 'আমাদের জানানোর জন্য ধন্যবাদ। আমরা বিষয়টি খতিয়ে দেখব।'
  }
};

let uiLang = 'bn';
try {
  const saved = window.localStorage.getItem('uiLang');
  if (saved === 'en' || saved === 'bn') uiLang = saved;
} catch (err) {
  // localStorage unavailable (private mode etc.) — default stands.
}

function t(key, ...args) {
  const entry = (I18N[uiLang] && I18N[uiLang][key] !== undefined) ? I18N[uiLang][key] : I18N.en[key];
  return typeof entry === 'function' ? entry(...args) : entry;
}

// English id_type values ("OPD ID" etc.) always go to the server as-is —
// this only maps one to its translated on-screen label.
const ID_TYPE_LABEL_KEYS = {
  'OPD ID': 'idOpd',
  'IPD ID': 'idIpd',
  'DIAG ID': 'idDiag',
  'Patient Name': 'idName'
};
function idTypeDisplayLabel(idType) {
  const key = ID_TYPE_LABEL_KEYS[idType];
  return key ? t(key) : idType;
}

// Admin-entered names (counters, services) get an optional Bangla variant
// set on the admin panel — falls back to the English name whenever the
// Bangla one is unset or the UI is in English. Never affects what's
// stored/sent to the server, only what's shown on screen.
function localizedName(en, bn) {
  return uiLang === 'bn' && bn ? bn : en;
}

// Re-applies the "Enter <type>" label + placeholder for whichever id type
// is currently selected, in the current UI language — shared by the
// Satisfied and Complain flows' identical identification fields, called
// right after picking a type and again from refreshDynamicUiText() if the
// language changes mid-flow while that field is showing.
function updateIdValueFieldLabels(labelElId, inputEl, idType) {
  document.getElementById(labelElId).textContent = t('enterValueFor', idTypeDisplayLabel(idType));
  inputEl.placeholder = idType === 'Patient Name'
    ? t('placeholderFullName')
    : t('placeholderIdExample', `${idType.split(' ')[0]}-2026-00123`);
}

const uiLangButtons = document.querySelectorAll('.ui-lang-btn');

function applyUILang() {
  document.documentElement.lang = uiLang;
  document.documentElement.style.setProperty(
    '--font-display',
    uiLang === 'bn' ? "'Noto Sans Bengali', 'Manrope', system-ui, sans-serif" : "'Manrope', system-ui, sans-serif"
  );
  document.documentElement.style.setProperty(
    '--font-body',
    uiLang === 'bn' ? "'Noto Sans Bengali', 'Inter', system-ui, sans-serif" : "'Inter', system-ui, sans-serif"
  );
  document.title = t('docTitle');

  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });

  uiLangButtons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.uiLang === uiLang);
  });

  // Re-render bits generated dynamically in JS rather than sitting as
  // static markup, so a mid-flow language switch stays consistent.
  if (typeof refreshDynamicUiText === 'function') refreshDynamicUiText();
}

uiLangButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    if (btn.dataset.uiLang === uiLang) return;
    uiLang = btn.dataset.uiLang;
    try {
      window.localStorage.setItem('uiLang', uiLang);
    } catch (err) {
      // ignore — nothing to persist to, session just won't remember it.
    }
    applyUILang();
    // The on-screen keyboard has its own independent EN/বাংলা input
    // toggle, but it's still nice for it to start in the same language
    // as the UI — only when nothing's been typed into yet (oskTarget is
    // only set while the keyboard is open) to avoid yanking it out from
    // under someone mid-typing.
    if (typeof syncOskLangWithUi === 'function' && !oskTarget) syncOskLangWithUi();
  });
});

const screens = {
  choice: document.getElementById('screen-choice'),
  satisfied: document.getElementById('screen-satisfied'),
  complain: document.getElementById('screen-complain'),
  serial: document.getElementById('screen-serial'),
  serialDone: document.getElementById('screen-serial-done'),
  done: document.getElementById('screen-done')
};

function showScreen(name) {
  if (name !== 'complain') stopVoiceIfActive(); // don't keep listening after leaving the complaint page
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
// SATISFIED — star rating + identification, one page, Submit at the
// bottom sends both together.
// ==========================================================
const starButtons = Array.from(document.querySelectorAll('.star-btn'));
let submittingRating = false;
let selectedRating = null;

function resetStars() {
  starButtons.forEach((b) => b.classList.remove('lit', 'hover-lit'));
  selectedRating = null;
  clearSatisfiedIdentification();
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
  btn.addEventListener('click', () => {
    starButtons.forEach((b) => (b.classList.toggle('lit', Number(b.dataset.star) <= n)));
    selectedRating = n;
    satisfiedIdentifyError.hidden = true;
  });
});

document.getElementById('back-from-satisfied').addEventListener('click', () => {
  showScreen('choice');
});

// ---- SATISFIED: how should we identify you (required) ----
const satisfiedIdTypeButtons = document.querySelectorAll('#satisfied-id-type-grid .id-type-btn');
const satisfiedIdValueWrap = document.getElementById('satisfied-id-value-wrap');
const satisfiedIdValueInput = document.getElementById('satisfied-id-value-input');
const satisfiedIdentifyError = document.getElementById('satisfied-identify-error');
const submitSatisfiedBtn = document.getElementById('submit-satisfied');
let satisfiedIdType = null;
let satisfiedIdValue = '';

satisfiedIdTypeButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    if (satisfiedIdType === btn.dataset.idtype) {
      clearSatisfiedIdentification();
      return;
    }
    satisfiedIdTypeButtons.forEach((b) => b.classList.remove('selected'));
    btn.classList.add('selected');
    satisfiedIdType = btn.dataset.idtype;
    updateIdValueFieldLabels('satisfied-id-value-label', satisfiedIdValueInput, satisfiedIdType);
    satisfiedIdValueWrap.hidden = false;
    satisfiedIdValueInput.value = '';
    satisfiedIdValue = '';
    satisfiedIdentifyError.hidden = true;
    satisfiedIdValueInput.focus();
  });
});

document.getElementById('satisfied-id-clear').addEventListener('click', clearSatisfiedIdentification);

function clearSatisfiedIdentification() {
  satisfiedIdTypeButtons.forEach((b) => b.classList.remove('selected'));
  satisfiedIdValueWrap.hidden = true;
  satisfiedIdValueInput.value = '';
  satisfiedIdType = null;
  satisfiedIdValue = '';
  satisfiedIdentifyError.hidden = true;
}

satisfiedIdValueInput.setAttribute('inputmode', 'none');
satisfiedIdValueInput.addEventListener('focus', () => showKeyboard(satisfiedIdValueInput));
satisfiedIdValueInput.addEventListener('input', () => {
  satisfiedIdValue = satisfiedIdValueInput.value;
});

submitSatisfiedBtn.addEventListener('click', async () => {
  if (submittingRating) return;
  if (!selectedRating) {
    satisfiedIdentifyError.textContent = t('errNoRating');
    satisfiedIdentifyError.hidden = false;
    return;
  }
  if (!satisfiedIdType || !satisfiedIdValue.trim()) {
    satisfiedIdentifyError.textContent = t('errNoId');
    satisfiedIdentifyError.hidden = false;
    return;
  }
  satisfiedIdentifyError.hidden = true;
  submittingRating = true;

  try {
    const res = await fetch('/api/submissions/satisfied', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating: selectedRating, id_type: satisfiedIdType, id_value: satisfiedIdValue.trim() })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || t('errRatingFailed'));
    showSatisfiedDone();
  } catch (err) {
    satisfiedIdentifyError.textContent = err.message;
    satisfiedIdentifyError.hidden = false;
    submittingRating = false;
  }
});

function showSatisfiedDone() {
  const doneIcon = document.getElementById('done-icon');
  const doneTitle = document.getElementById('done-title');
  const doneSub = document.getElementById('done-sub');
  doneIcon.style.background = 'var(--green-soft)';
  doneIcon.style.color = '#12805a';
  doneIcon.innerHTML = '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#12805a" stroke-width="3"><path d="M4 12l5 5L20 6"/></svg>';
  doneTitle.textContent = t('doneSatisfiedTitle');
  doneSub.textContent = t('doneSatisfiedSub');
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
const idTypeButtons = document.querySelectorAll('#id-type-grid .id-type-btn');
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
let countersEmptyState = null; // null once loaded fine; 'empty' | 'error' otherwise — lets refreshDynamicUiText() re-translate this message on a language switch

// Tapping Complain: create the "unspecified" complaint row right away (in
// the background — the patient never waits on this) and go straight to the
// complain page. Every fresh tap of Complain starts a brand new unspecified
// row, even if a previous visit to this page was abandoned without
// submitting — abandoned ones just stay in Reports as-is, which is the
// point (staff can see someone was upset even if they didn't finish).
function openComplainScreen() {
  complainState.submissionId = null;
  showScreen('complain');
  showComplainStep(1);
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

// ---- Three steps: 1 what happened, 2 which counter(s), 3 identification ----
// Same single screen and the same state/Submit as before — each step just
// shows one section at a time so everything can be bigger.
const COMPLAIN_STEPS = 3;
const complainStepEls = Array.from(document.querySelectorAll('.complain-step'));
const complainBars = Array.from(document.querySelectorAll('#screen-complain .step-bars span'));
const complainStepCount = document.getElementById('complain-step-count');
const complainNextBtn = document.getElementById('complain-next');
let complainStep = 1;

function updateComplainProgress() {
  complainBars.forEach((bar, i) => bar.classList.toggle('on', i < complainStep));
  complainStepCount.textContent = t('stepOf', complainStep, COMPLAIN_STEPS);
}

function showComplainStep(n) {
  complainStep = n;
  complainStepEls.forEach((el) => (el.hidden = Number(el.dataset.step) !== n));
  complainNextBtn.hidden = n >= COMPLAIN_STEPS;
  submitBtn.hidden = n < COMPLAIN_STEPS;
  complainError.hidden = true;
  hideKeyboard();
  updateComplainProgress();
  window.scrollTo(0, 0);
}

document.getElementById('back-from-complain').addEventListener('click', () => {
  if (complainStep > 1) {
    showComplainStep(complainStep - 1);
    return;
  }
  showScreen('choice');
  hideKeyboard();
});

// Next only moves on once this step's own question is answered, so a
// patient finds out right here — not at the very end — what's missing.
complainNextBtn.addEventListener('click', () => {
  complainError.hidden = true;
  if (complainStep === 1) {
    if (isRecording) {
      showComplainError(t('errStillRecording'));
      return;
    }
    if (!complaintText.value.trim() && !complainState.voiceBlob) {
      showComplainError(t('errNoText'));
      return;
    }
  } else if (complainStep === 2) {
    if (complainState.selectedCounterIds.size === 0) {
      showComplainError(t('errNoCounter'));
      return;
    }
  }
  showComplainStep(complainStep + 1);
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
complaintText.addEventListener('input', () => {
  autoGrowTextarea(complaintText);
  complainError.hidden = true;
});

// Grows the complaint box with what's typed (up to a cap, then it scrolls
// internally) so the text already written stays visible instead of being
// hidden a few lines up in a fixed-height box.
function autoGrowTextarea(el) {
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
}

// ---- Which counter(s) ----
let lastCountersData = [];

// Rebuilds the counter grid from the last fetched data (no re-fetch) —
// used both after a real load and from refreshDynamicUiText() so a
// mid-flow language switch re-labels each button (English name vs its
// admin-set Bangla name) without losing the current selection.
function renderCounterGrid() {
  counterGrid.innerHTML = '';
  lastCountersData.forEach((c) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'counter-btn' + (complainState.selectedCounterIds.has(c.id) ? ' selected' : '');
    btn.innerHTML = `<span>${escapeHtml(c.counter_number)}</span><span class="counter-name">${escapeHtml(localizedName(c.counter_name, c.counter_name_bn))}</span>`;
    btn.addEventListener('click', () => {
      complainError.hidden = true;
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
}

async function loadCountersIntoScreen() {
  try {
    const res = await fetch('/api/counters');
    const counters = await res.json();
    if (!counters.length) {
      countersEmptyState = 'empty';
      counterGrid.innerHTML = `<div class="counter-empty">${escapeHtml(t('counterEmpty'))}</div>`;
      return;
    }
    countersEmptyState = null;
    lastCountersData = counters;
    renderCounterGrid();
    countersLoaded = true;
  } catch (err) {
    countersEmptyState = 'error';
    counterGrid.innerHTML = `<div class="counter-empty">${escapeHtml(t('counterError'))}</div>`;
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
    updateIdValueFieldLabels('id-value-label', idValueInput, complainState.id_type);
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

// ---- Voice -> text ----
// While recording, the browser's own speech recognition (Chrome's
// SpeechRecognition, which sends the audio to Google for transcription and
// so needs internet) turns what's said into Bangla/English text, written
// live into the complaint box. The patient can read and fix it with the
// on-screen keyboard. The audio itself is still recorded and submitted
// exactly as before, so the original is never lost if the text is off.
// Browsers without SpeechRecognition just skip this — recording still works.
const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
const voiceStatus = document.getElementById('voice-status');
let recognition = null;
let recWanted = false; // true from Record until Stop — drives auto-restart on pauses
let recFinal = '';     // confirmed text so far
let recInterim = '';   // the still-changing tail of what's being said
let recPrefix = '';    // a space, when appending after existing text
let recStart = 0;      // where in the text box our text starts
let recSegLen = 0;     // how many characters of it we've written
let recGotText = false;

function setVoiceStatus(key) {
  voiceStatus.dataset.key = key || '';
  voiceStatus.hidden = !key;
  if (key) voiceStatus.textContent = t(key);
}

// Writes the recognised text into the box, replacing only our own segment —
// anything the patient typed before or after it is left alone.
function recWrite() {
  const body = recFinal + (recInterim ? (recFinal ? ' ' : '') + recInterim : '');
  const seg = body ? recPrefix + body : '';
  complaintText.value =
    complaintText.value.slice(0, recStart) + seg + complaintText.value.slice(recStart + recSegLen);
  recSegLen = seg.length;
  complaintText.dispatchEvent(new Event('input', { bubbles: true }));
}

function launchRecognition() {
  const rec = new SpeechRec();
  recognition = rec;
  rec.lang = uiLang === 'bn' ? 'bn-BD' : 'en-US';
  rec.continuous = true;
  rec.interimResults = true;
  rec.onstart = () => {
    if (!voiceStatus.dataset.key || voiceStatus.dataset.key === 'voiceListening') setVoiceStatus('voiceListening');
  };
  rec.onresult = (e) => {
    recInterim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const text = e.results[i][0].transcript.trim();
      if (!text) continue;
      if (e.results[i].isFinal) recFinal += (recFinal ? ' ' : '') + text;
      else recInterim += (recInterim ? ' ' : '') + text;
    }
    recGotText = true;
    recWrite();
  };
  rec.onerror = (e) => {
    // Silence and aborts are normal — onend below just starts listening
    // again. Anything else (no internet, mic blocked, language not offered)
    // means live text won't work; say so once and leave recording alone.
    if (e.error === 'no-speech' || e.error === 'aborted') return;
    recWanted = false;
    setVoiceStatus('voiceSttFailed');
  };
  rec.onend = () => {
    if (recInterim) { // keep what was heard even if it never got confirmed
      recFinal += (recFinal ? ' ' : '') + recInterim;
      recInterim = '';
      recWrite();
    }
    if (recWanted && isRecording) {
      // Chrome ends a session after a pause or about a minute — carry on.
      try { launchRecognition(); } catch (err) { recWanted = false; }
    } else if (!(voiceStatus.dataset.key || '').startsWith('voiceStt')) {
      setVoiceStatus(recGotText ? 'voiceTextHint' : null);
    }
  };
  rec.start();
}

function startSpeechToText() {
  if (!SpeechRec) return;
  const v = complaintText.value;
  recStart = v.length;
  recSegLen = 0;
  recFinal = '';
  recInterim = '';
  recGotText = false;
  recPrefix = v && !/\s$/.test(v) ? ' ' : '';
  recWanted = true;
  setVoiceStatus(null);
  try { launchRecognition(); } catch (err) { recWanted = false; }
}

function stopSpeechToText() {
  recWanted = false;
  if (recognition) {
    try { recognition.stop(); } catch (err) { /* already stopped */ }
  }
}

// Stops recording (and live text) — used by the Stop button and when the
// patient leaves the complaint screen mid-recording.
function stopVoiceIfActive() {
  if (!isRecording) return;
  mediaRecorder.stop();
  isRecording = false;
  voiceBtn.classList.remove('recording');
  voiceBtnLabel.textContent = t('voiceRecordLabel');
  stopSpeechToText();
}

voiceBtn.addEventListener('click', async () => {
  if (!isRecording) {
    // getUserMedia only exists in a "secure context" — https://, or the
    // browser opened directly on http://localhost / http://127.0.0.1. If
    // this kiosk is being reached over the LAN via a plain http://<ip>:3000
    // address, the browser hides the whole mediaDevices API and this is
    // why voice recording silently can't start.
    if (!window.isSecureContext) {
      showComplainError(t('errVoiceSecure'));
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showComplainError(t('errVoiceUnsupported'));
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
      voiceBtnLabel.textContent = t('voiceStopLabel');
      startSpeechToText();
    } catch (err) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        showComplainError(t('errMicDenied'));
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        showComplainError(t('errMicMissing'));
      } else if (err.name === 'NotReadableError') {
        showComplainError(t('errMicBusy'));
      } else {
        showComplainError(t('errVoiceGeneric', err.message));
      }
    }
  } else {
    stopVoiceIfActive();
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

  // Next already checks steps 1 and 2; re-check here as a safety net and
  // jump back to the step that's missing something.
  const text = complaintText.value.trim();
  if (!text && !complainState.voiceBlob) {
    showComplainStep(1);
    showComplainError(t('errNoText'));
    return;
  }
  if (complainState.selectedCounterIds.size === 0) {
    showComplainStep(2);
    showComplainError(t('errNoCounter'));
    return;
  }
  if (!complainState.id_type || !complainState.id_value.trim()) {
    showComplainError(t('errNoId'));
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
    if (!res.ok) throw new Error(data.error || t('errSubmitFailed'));

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
  doneTitle.textContent = t('doneComplainTitle');
  doneSub.textContent = t('doneComplainSub');
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
  recGotText = false;
  setVoiceStatus(null);
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
let serialEmptyState = null; // null once loaded fine; 'empty' | 'error' otherwise — same pattern as countersEmptyState

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

let lastServicesData = [];

// Same pattern as renderCounterGrid() — rebuilds from the last fetched
// data so a mid-flow language switch re-labels services without losing
// the current selection or re-fetching.
function renderServiceGrid() {
  serialServiceGrid.innerHTML = '';
  lastServicesData.forEach((s) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'id-type-btn' + (selectedServiceId === s.id ? ' selected' : '');
    btn.textContent = localizedName(s.service_name, s.service_name_bn);
    btn.addEventListener('click', () => {
      selectedServiceId = s.id;
      serialServiceGrid.querySelectorAll('.id-type-btn.selected').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      getSerialBtn.disabled = false;
      serialError.hidden = true;
    });
    serialServiceGrid.appendChild(btn);
  });
}

async function loadServicesIntoSerialScreen() {
  try {
    const res = await fetch('/api/services');
    const services = await res.json();
    if (!services.length) {
      serialEmptyState = 'empty';
      serialServiceGrid.innerHTML = `<div class="counter-empty">${escapeHtml(t('serialEmpty'))}</div>`;
      return;
    }
    serialEmptyState = null;
    lastServicesData = services;
    renderServiceGrid();
    serialServicesLoaded = true;
  } catch (err) {
    serialEmptyState = 'error';
    serialServiceGrid.innerHTML = `<div class="counter-empty">${escapeHtml(t('serialLoadError'))}</div>`;
  }
}

function showSerialDone(data) {
  document.getElementById('serial-ticket-number').textContent = data.ticket_number;
  const counterLabel = localizedName(data.counter_name, data.counter_name_bn);
  const serviceLabel = localizedName(data.service_name, data.service_name_bn);
  document.getElementById('serial-ticket-counter').textContent = `${counterLabel} · ${serviceLabel}`;
  showScreen('serialDone');
}

getSerialBtn.addEventListener('click', async () => {
  if (!selectedServiceId) {
    serialError.textContent = t('errNoService');
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
    if (!res.ok) throw new Error(data.error || t('errTicketFailed'));
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
// ON-SCREEN KEYBOARD — three input modes:
//   'en' English (QWERTY, letters + symbols layer)
//   'ph' Bangla phonetic, Avro-style: tap English letters, get Bangla
//        (ami -> আমি) with a suggestion bar of Bangla words — see
//        phonetic.js for the rules and word list
//   'bn' Bangla letter grid (vowels, vowel-signs/kar, consonants, digits,
//        plus a "যুক্ত" layer of ready-made conjuncts and a big hasant ্)
// Shown automatically for the complaint text box and the identification
// value field, since kiosk devices may have no physical keyboard attached.
// ==========================================================
const osk = document.getElementById('osk');
const oskKeysEl = document.getElementById('osk-keys');
const oskDoneBtn = document.getElementById('osk-done');
const oskLangButtons = document.querySelectorAll('.osk-lang-btn');
const oskSuggestEl = document.getElementById('osk-suggest');
const oskBufEl = document.getElementById('osk-buf');
const oskCandsEl = document.getElementById('osk-cands');

let oskTarget = null;
let oskLang = 'en'; // 'en' | 'ph' | 'bn'
let oskShift = false;
let oskLayer = 'letters'; // 'letters' | 'symbols' (en, ph) | 'more' | 'conj' (bn)

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
  ['more', 'conj', ',', 'space', '।', 'enter']
];
const BN_MORE = [
  ['১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯', '০'],
  ['ড়', 'ঢ়', 'য়', 'ৎ', 'ং', 'ঃ', 'ঁ', 'backspace'],
  ['letters', ',', 'space', '.', 'enter']
];
// Ready-made conjuncts (যুক্তবর্ণ): one tap each instead of consonant +
// hasant + consonant. The ্র / ্য / র্ keys are the র-ফলা, য-ফলা and রেফ
// that attach to the consonant typed next to them.
const BN_CONJ = [
  ['ক্ষ', 'জ্ঞ', 'ঙ্গ', 'ঙ্ক', 'ন্ত', 'ন্দ', 'ন্ধ'],
  ['স্ত', 'ক্ত', 'ম্প', 'ম্ব', 'ল্ল', 'ষ্ট', 'ষ্ঠ'],
  ['ত্ত', 'দ্দ', 'দ্ব', 'ব্দ', 'শ্চ', 'হ্ম', 'ক্র'],
  ['ত্র', 'প্র', 'গ্র', '্র', '্য', 'র্', 'backspace'],
  ['letters', ',', 'space', '।', 'enter']
];
// Keys whose label gets a dotted circle so a lone sign is readable.
const BN_SIGN_LABELS = { '্র': '◌্র', '্য': '◌্য', '্': '◌্' };

function oskCurrentRows() {
  if (oskLang === 'bn') {
    if (oskLayer === 'more') return BN_MORE;
    if (oskLayer === 'conj') return BN_CONJ;
    return BN_LETTERS;
  }
  return oskLayer === 'symbols' ? EN_SYMBOLS : EN_LETTERS;
}

// ---- Phonetic composition state ----
// While a word is being typed in 'ph' mode, phBuf holds its English letters
// ("bhal") and the text box shows the current best Bangla word in place
// (from phStart, phLen characters long). Space, punctuation, a suggestion
// tap, or moving the cursor ends the word.
let phBuf = '';
let phStart = 0;
let phLen = 0;

function phReset() {
  phBuf = '';
  phLen = 0;
  phRenderStrip();
}

function isIdField(el) {
  // The identification value inputs (OPD ID etc.) keep English digits and
  // a plain "." — hospital IDs aren't written in Bangla numerals.
  return !!el && el.classList.contains('text-input');
}

function phRenderStrip() {
  oskSuggestEl.hidden = oskLang !== 'ph';
  if (oskLang !== 'ph') return;
  oskCandsEl.innerHTML = '';
  if (!phBuf) {
    oskBufEl.textContent = t('phHint');
    oskBufEl.className = 'osk-buf hint';
    return;
  }
  oskBufEl.textContent = phBuf;
  oskBufEl.className = 'osk-buf';
  BanglaPhonetic.suggest(phBuf).forEach((word, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'osk-cand' + (i === 0 ? ' first' : '');
    b.textContent = word;
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', () => phPick(word));
    oskCandsEl.appendChild(b);
  });
}

// Writes `text` over the word being composed.
function phWrite(text) {
  const el = oskTarget;
  el.value = el.value.slice(0, phStart) + text + el.value.slice(phStart + phLen);
  phLen = text.length;
  const pos = phStart + phLen;
  el.setSelectionRange(pos, pos);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

// A composition only continues if the cursor is still right after the word
// we wrote (the patient may have tapped somewhere else in the text).
function phStillValid() {
  const el = oskTarget;
  const pos = phStart + phLen;
  return phBuf && el.selectionStart === pos && el.selectionEnd === pos;
}

function phType(letter) {
  const el = oskTarget;
  if (!phStillValid()) {
    phBuf = '';
    phLen = 0;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    if (end > start) { // typing over a selection replaces it
      el.value = el.value.slice(0, start) + el.value.slice(end);
      el.setSelectionRange(start, start);
    }
    phStart = start;
  }
  phBuf += letter;
  phWrite(BanglaPhonetic.suggest(phBuf)[0]);
  phRenderStrip();
}

function phBackspace() {
  phBuf = phBuf.slice(0, -1);
  if (!phBuf) {
    phWrite('');
    phLen = 0;
  } else {
    phWrite(BanglaPhonetic.suggest(phBuf)[0]);
  }
  phRenderStrip();
}

// Tapping a suggestion replaces the word and adds a space after it.
function phPick(word) {
  if (!oskTarget) return;
  if (!phStillValid()) return;
  phWrite(word + ' ');
  phReset();
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
      else if (key === 'conj') { label = 'যুক্ত'; extraClass = 'wide func'; }
      else if (key === 'letters') { label = oskLang === 'bn' ? 'বাংলা' : 'ABC'; extraClass = 'wide func'; }
      else if (key === '্') { label = BN_SIGN_LABELS[key]; extraClass = 'hasant'; }
      else if (BN_SIGN_LABELS[key]) { label = BN_SIGN_LABELS[key]; extraClass = 'conj'; }
      else if (oskLang === 'bn' && oskLayer === 'conj') { extraClass = 'conj'; }
      else if (oskLang === 'ph' && /^[a-z]$/.test(key)) {
        // Phonetic keys show the English letter with the Bangla it makes.
        const latin = oskShift ? key.toUpperCase() : key;
        btn.innerHTML = `<span class="k-latin">${latin}</span><span class="k-hint">${BanglaPhonetic.convert(latin)}</span>`;
        btn.className = 'osk-key has-hint';
        rowEl.appendChild(btn);
        return;
      }
      else if (oskLang === 'en' && oskShift) { label = key.toUpperCase(); }
      btn.textContent = label;
      btn.className = `osk-key ${extraClass}`.trim();
      rowEl.appendChild(btn);
    });
    oskKeysEl.appendChild(rowEl);
  });
  phRenderStrip();
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
// cursor position) — block that on mousedown so focus stays on the field,
// and act only on the click that follows. Don't preventDefault touchstart:
// that suppresses the synthesized click, so touch taps would do nothing.
oskKeysEl.addEventListener('mousedown', (e) => e.preventDefault());

oskKeysEl.addEventListener('click', (e) => {
  const btn = e.target.closest('.osk-key');
  if (!btn || !oskTarget) return;
  const key = btn.dataset.key;

  if (key === 'shift') {
    oskShift = !oskShift;
    renderKeyboard();
    return;
  }
  if (key === 'symbols' || key === 'letters' || key === 'more' || key === 'conj') {
    phReset(); // the word being typed is done once the layer changes
    oskLayer = key;
    renderKeyboard();
    return;
  }
  if (key === 'backspace') {
    if (oskLang === 'ph' && phStillValid()) phBackspace();
    else { phReset(); oskBackspace(oskTarget); }
    return;
  }
  if (key === 'space') {
    phReset(); // the Bangla already shown is the first suggestion — keep it
    oskInsert(oskTarget, ' ');
    return;
  }
  if (key === 'enter') {
    phReset();
    if (oskTarget.tagName === 'TEXTAREA') {
      oskInsert(oskTarget, '\n');
    } else {
      hideKeyboard();
    }
    return;
  }

  // Phonetic Bangla: letters build up a word (bhal -> ভাল) in place.
  if (oskLang === 'ph' && /^[a-z]$/.test(key)) {
    phType(oskShift ? key.toUpperCase() : key);
    if (oskShift) { oskShift = false; renderKeyboard(); }
    return;
  }

  let char = key;
  if (oskLang !== 'bn' && oskShift) {
    char = key.toUpperCase();
    oskShift = false;
    renderKeyboard();
  }
  if (oskLang === 'ph') {
    // Digits and punctuation end the word; in Bangla text, digits become
    // ০–৯ and "." becomes "।" — except in the ID fields (see isIdField).
    phReset();
    if (!isIdField(oskTarget)) {
      if (/^[0-9]$/.test(char)) char = '০১২৩৪৫৬৭৮৯'[Number(char)];
      else if (char === '.') char = '।';
    }
  }
  oskInsert(oskTarget, char);
});

oskLangButtons.forEach((btn) => {
  btn.addEventListener('mousedown', (e) => e.preventDefault());
  btn.addEventListener('click', () => {
    phReset();
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
  if (oskTarget !== target) phReset(); // a different field — start fresh
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
  phReset();
  osk.hidden = true;
  oskTarget = null;
  document.querySelectorAll('.screen.keyboard-open').forEach((el) => el.classList.remove('keyboard-open'));
}

// Matches the on-screen keyboard's own EN/বাংলা input toggle to the UI
// language — called on load and on a UI language switch (but never while
// someone has the keyboard open and might be mid-word, see the toggle's
// click handler above).
function syncOskLangWithUi() {
  // Bangla UI opens the keyboard in phonetic mode (type "ami" -> আমি); the
  // letter grid is one tap away on the toolbar.
  const mode = uiLang === 'bn' ? 'ph' : 'en';
  const targetBtn = Array.from(oskLangButtons).find((b) => b.dataset.lang === mode);
  if (!targetBtn) return;
  phReset();
  oskLang = mode;
  oskLayer = 'letters';
  oskShift = false;
  oskLangButtons.forEach((b) => b.classList.toggle('active', b === targetBtn));
  osk.classList.toggle('lang-bn', oskLang === 'bn');
  renderKeyboard();
}

// Re-renders whatever UI text was generated dynamically in JS (rather than
// sitting as static [data-i18n] markup) so a mid-flow language switch
// stays fully consistent — called from applyUILang().
function refreshDynamicUiText() {
  if (satisfiedIdType && !satisfiedIdValueWrap.hidden) {
    updateIdValueFieldLabels('satisfied-id-value-label', satisfiedIdValueInput, satisfiedIdType);
  }
  if (complainState.id_type && !idValueWrap.hidden) {
    updateIdValueFieldLabels('id-value-label', idValueInput, complainState.id_type);
  }
  voiceBtnLabel.textContent = isRecording ? t('voiceStopLabel') : t('voiceRecordLabel');
  if (voiceStatus.dataset.key) voiceStatus.textContent = t(voiceStatus.dataset.key);
  updateComplainProgress();
  if (countersLoaded) renderCounterGrid();
  if (serialServicesLoaded) renderServiceGrid();

  if (!countersLoaded && countersEmptyState) {
    counterGrid.innerHTML = `<div class="counter-empty">${escapeHtml(t(countersEmptyState === 'empty' ? 'counterEmpty' : 'counterError'))}</div>`;
  }
  if (!serialServicesLoaded && serialEmptyState) {
    serialServiceGrid.innerHTML = `<div class="counter-empty">${escapeHtml(t(serialEmptyState === 'empty' ? 'serialEmpty' : 'serialLoadError'))}</div>`;
  }
}

// ---------------- Initial UI language state ----------------
applyUILang();
syncOskLangWithUi();
