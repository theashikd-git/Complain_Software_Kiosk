// ==========================================================
// Avro-style phonetic Bangla for the kiosk's on-screen keyboard.
//
// Type the sound in English letters and get Bangla back:
//   ami -> আমি, tumi -> তুমি, kemon -> কেমন, bondhu -> বন্ধু
//
// Everything runs in the browser (no network, no libraries), so it works on
// a LAN-only kiosk. Two parts:
//   convert(latin)  — rule-based transliteration, case-sensitive like Avro
//                     (t -> ত, T -> ট, d -> দ, D -> ড, sh -> শ, Sh -> ষ ...)
//   suggest(latin)  — candidate words for the suggestion bar: the best
//                     dictionary match first, then the plain rule-based
//                     result, then longer words that start the same way.
//
// Rules worth knowing (they match Avro):
//   - Two consonants in a row join into a conjunct (যুক্তবর্ণ):
//       bondhu -> বন্ধু, shobdo -> শব্দ, prem -> প্রেম, kShoma -> ক্ষমা
//   - "o" after a consonant is the built-in vowel (writes nothing), so
//     typing "o" between two consonants keeps them apart: kokhon -> কখন
//   - Capital "O" gives the ো sign: kO -> কো
//   - ng -> ং, Ng -> ঙ, y after a vowel -> য়, y after a consonant -> ্য
// ==========================================================
(function (root) {
  // ---- Consonants (type C). Longest match wins, so "kh" beats "k"+"h". ----
  const CONSONANTS = {
    ngkh: 'ঙ্খ', nggh: 'ঙ্ঘ', ngk: 'ঙ্ক', ngg: 'ঙ্গ',
    nch: 'ঞ্ছ', njh: 'ঞ্ঝ', nc: 'ঞ্চ', nj: 'ঞ্জ',
    kkh: 'ক্ষ', gg: 'জ্ঞ',
    Ng: 'ঙ', NG: 'ঞ',
    kh: 'খ', gh: 'ঘ', jh: 'ঝ', Th: 'ঠ', Dh: 'ঢ', th: 'থ', dh: 'ধ', ph: 'ফ', bh: 'ভ',
    Rh: 'ঢ়', Sh: 'ষ', sh: 'শ', ch: 'ছ',
    k: 'ক', g: 'গ', c: 'চ', j: 'জ', T: 'ট', D: 'ড', N: 'ণ', t: 'ত', d: 'দ', n: 'ন',
    p: 'প', f: 'ফ', b: 'ব', v: 'ভ', m: 'ম', z: 'য', Z: 'য', r: 'র', l: 'ল',
    S: 'শ', s: 'স', h: 'হ', R: 'ড়', q: 'ক', x: 'ক্স'
  };

  // ---- Vowels: [standalone form, vowel-sign after a consonant] ----
  const VOWELS = {
    rri: ['ঋ', 'ৃ'],
    oi: ['ঐ', 'ৈ'], OI: ['ঐ', 'ৈ'], ou: ['ঔ', 'ৌ'], OU: ['ঔ', 'ৌ'],
    aa: ['আ', 'া'], ii: ['ঈ', 'ী'], uu: ['ঊ', 'ূ'],
    a: ['আ', 'া'], A: ['আ', 'া'], i: ['ই', 'ি'], I: ['ঈ', 'ী'],
    u: ['উ', 'ু'], U: ['ঊ', 'ূ'], e: ['এ', 'ে'], E: ['এ', 'ে'], O: ['ও', 'ো']
  };

  // ---- Marks that attach to what came before (anusvara) ----
  const MARKS = { ng: 'ং' };

  const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
  const HASANT = '্';
  const MAX_TOKEN = 4;

  // Reads the next token at position i: { kind, text, len } or null.
  function nextToken(s, i) {
    for (let len = Math.min(MAX_TOKEN, s.length - i); len >= 1; len--) {
      const part = s.substr(i, len);
      if (CONSONANTS[part]) return { kind: 'C', text: CONSONANTS[part], len };
      if (VOWELS[part]) return { kind: 'V', vowel: VOWELS[part], len };
      if (MARKS[part]) return { kind: 'M', text: MARKS[part], len };
      if (part === 'o') return { kind: 'o', len };
      if (part === 'y') return { kind: 'y', len };
      if (part === 'w') return { kind: 'w', len };
    }
    // Unknown capital (e.g. "K") — treat like its lowercase letter.
    const ch = s[i];
    const lower = ch.toLowerCase();
    if (lower !== ch) {
      const t = nextToken(lower + s.slice(i + 1, i + MAX_TOKEN), 0);
      if (t && t.len === 1) return t;
    }
    return null;
  }

  function convert(latin) {
    let out = '';
    // What the last thing written was:
    //  'C' consonant, 'V' vowel / vowel-sign, 'I' built-in "o" vowel,
    //  'M' mark, 'X' anything else (start of word, digit, symbol).
    let prev = 'X';
    let i = 0;
    while (i < latin.length) {
      const tok = nextToken(latin, i);
      if (!tok) {
        const ch = latin[i];
        out += /[0-9]/.test(ch) ? BN_DIGITS[Number(ch)] : ch;
        prev = 'X';
        i += 1;
        continue;
      }
      i += tok.len;

      if (tok.kind === 'C' || tok.kind === 'y' || tok.kind === 'w') {
        let text = tok.text;
        if (tok.kind === 'y') text = prev === 'C' ? 'য' : 'য়'; // য-ফলা vs য়
        if (tok.kind === 'w') {
          if (prev === 'C') text = 'ব'; // ব-ফলা: sw -> স্ব
          else { out += 'ও'; prev = 'V'; continue; }
        }
        out += (prev === 'C' ? HASANT : '') + text;
        prev = 'C';
      } else if (tok.kind === 'V') {
        out += prev === 'C' ? tok.vowel[1] : tok.vowel[0];
        prev = 'V';
      } else if (tok.kind === 'o') {
        if (prev === 'C') { prev = 'I'; } // built-in vowel: writes nothing
        else { out += 'অ'; prev = 'V'; }
      } else if (tok.kind === 'M') {
        out += tok.text;
        prev = 'M';
      }
    }
    return out;
  }

  // ---- Dictionary: [typed-as, Bangla]. Common words for a hospital kiosk,
  // plus everyday words, with a few spelling variants under one key. ----
  const WORDS = [
    ['ami', 'আমি'], ['amar', 'আমার'], ['amader', 'আমাদের'], ['amake', 'আমাকে'],
    ['tumi', 'তুমি'], ['tomar', 'তোমার'], ['apni', 'আপনি'], ['apnar', 'আপনার'], ['apnader', 'আপনাদের'],
    ['se', 'সে'], ['tara', 'তারা'], ['tader', 'তাদের'], ['keu', 'কেউ'], ['kono', 'কোনো'],
    ['ki', 'কি'], ['kintu', 'কিন্তু'], ['ebong', 'এবং'], ['ar', 'আর'], ['ei', 'এই'], ['oi', 'ঐ'], ['ta', 'তা'],
    ['ek', 'এক'], ['ekta', 'একটা'], ['ekti', 'একটি'], ['dui', 'দুই'], ['tin', 'তিন'], ['char', 'চার'],
    ['keno', 'কেন'], ['kothay', 'কোথায়'], ['kokhon', 'কখন'], ['kemon', 'কেমন'], ['koto', 'কত'], ['kon', 'কোন'],
    ['ache', 'আছে'], ['nei', 'নেই'], ['hoy', 'হয়'], ['hoyeche', 'হয়েছে'], ['hoyni', 'হয়নি'],
    ['kore', 'করে'], ['korechi', 'করেছি'], ['korlo', 'করল'], ['korte', 'করতে'], ['korbo', 'করব'],
    ['dite', 'দিতে'], ['diyechi', 'দিয়েছি'], ['dilo', 'দিল'], ['pai', 'পাই'], ['paini', 'পাইনি'], ['pachchi', 'পাচ্ছি'],
    ['gelam', 'গেলাম'], ['gechi', 'গেছি'], ['esechi', 'এসেছি'], ['elam', 'এলাম'], ['bolechi', 'বলেছি'], ['bolte', 'বলতে'],
    ['dekhlam', 'দেখলাম'], ['dekhechi', 'দেখেছি'], ['chai', 'চাই'], ['lagche', 'লাগছে'], ['lagbe', 'লাগবে'],
    ['hocche', 'হচ্ছে'], ['holo', 'হলো'], ['hobe', 'হবে'],
    ['ekhon', 'এখন'], ['tokhon', 'তখন'], ['aj', 'আজ'], ['kal', 'কাল'], ['ager', 'আগের'], ['age', 'আগে'], ['pore', 'পরে'],
    ['shokal', 'সকাল'], ['sokal', 'সকাল'], ['bikal', 'বিকাল'], ['ratre', 'রাতে'], ['din', 'দিন'],
    ['ghonta', 'ঘণ্টা'], ['minit', 'মিনিট'], ['somoy', 'সময়'], ['shomoy', 'সময়'],
    ['onek', 'অনেক'], ['onekkhon', 'অনেকক্ষণ'], ['khub', 'খুব'], ['shudhu', 'শুধু'], ['abar', 'আবার'],
    ['sob', 'সব'], ['sobar', 'সবার'], ['kichu', 'কিছু'], ['kichhu', 'কিছু'],
    ['haspatal', 'হাসপাতাল'], ['hospital', 'হাসপাতাল'], ['daktar', 'ডাক্তার'], ['doctor', 'ডাক্তার'],
    ['nurse', 'নার্স'], ['rogi', 'রোগী'], ['rogir', 'রোগীর'], ['rog', 'রোগ'],
    ['chikitsa', 'চিকিৎসা'], ['chikitsha', 'চিকিৎসা'], ['oshudh', 'ওষুধ'], ['osudh', 'ওষুধ'],
    ['report', 'রিপোর্ট'], ['bill', 'বিল'], ['taka', 'টাকা'], ['takar', 'টাকার'], ['fee', 'ফি'],
    ['counter', 'কাউন্টার'], ['seba', 'সেবা'], ['sheba', 'সেবা'], ['khabar', 'খাবার'], ['pani', 'পানি'],
    ['toilet', 'টয়লেট'], ['bed', 'বেড'], ['ward', 'ওয়ার্ড'], ['cabin', 'কেবিন'], ['emergency', 'ইমার্জেন্সি'],
    ['vorti', 'ভর্তি'], ['bhorti', 'ভর্তি'], ['release', 'রিলিজ'], ['discharge', 'ডিসচার্জ'],
    ['ticket', 'টিকিট'], ['serial', 'সিরিয়াল'], ['line', 'লাইন'], ['lain', 'লাইন'],
    ['apekkha', 'অপেক্ষা'], ['opekkha', 'অপেক্ষা'], ['deri', 'দেরি'], ['deri', 'দেরী'], ['deriteo', 'দেরিতেও'],
    ['bhalo', 'ভালো'], ['valo', 'ভালো'], ['bhalobasha', 'ভালোবাসা'], ['kalo', 'কালো'], ['kharap', 'খারাপ'],
    ['bhul', 'ভুল'], ['thik', 'ঠিক'], ['thikmoto', 'ঠিকমতো'], ['shundor', 'সুন্দর'], ['sundor', 'সুন্দর'],
    ['poriskar', 'পরিষ্কার'], ['osubidha', 'অসুবিধা'], ['shomossha', 'সমস্যা'], ['somossha', 'সমস্যা'],
    ['obhijog', 'অভিযোগ'], ['ovijog', 'অভিযোগ'], ['dhonnobad', 'ধন্যবাদ'], ['dhonyobad', 'ধন্যবাদ'],
    ['kotha', 'কথা'], ['kormochari', 'কর্মচারী'], ['karmachari', 'কর্মচারী'], ['staff', 'স্টাফ'],
    ['nam', 'নাম'], ['number', 'নম্বর'], ['nombor', 'নম্বর'], ['fon', 'ফোন'], ['mobile', 'মোবাইল'], ['thikana', 'ঠিকানা'],
    ['doya', 'দয়া'], ['onugroho', 'অনুগ্রহ']
  ];

  const MAX_SUGGESTIONS = 5;

  // Candidate Bangla words for what's been typed so far. The first one is
  // what gets written into the text box (and what Space confirms).
  function suggest(latin) {
    if (!latin) return [];
    const key = latin.toLowerCase();
    const exact = [];
    const prefix = [];
    WORDS.forEach(([k, bn]) => {
      if (k === key) exact.push(bn);
      else if (k.startsWith(key)) prefix.push([k, bn]);
    });
    prefix.sort((a, b) => a[0].length - b[0].length);
    const all = [...exact, convert(latin), ...prefix.map((p) => p[1])];
    return Array.from(new Set(all)).slice(0, MAX_SUGGESTIONS);
  }

  const api = { convert, suggest };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.BanglaPhonetic = api;
})(typeof window !== 'undefined' ? window : globalThis);
