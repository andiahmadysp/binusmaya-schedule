/**
 * content.js — Binusmaya LMS schedule scraper
 *
 * Runs in the context of lms.binus.ac.id and extracts schedule data
 * from the DOM.  Communicates with popup.js via chrome.runtime.sendMessage.
 *
 * @typedef {Object} ScheduleItem
 * @property {string}  subject   - Course / subject name
 * @property {string}  class     - Class identifier (e.g. "01PWW")
 * @property {string}  mode      - Raw delivery-mode text
 * @property {string}  modeKey   - CSS class key: online | virtual-class | other
 * @property {string}  type      - Granular type: online | virtual-class | quiz | exam
 * @property {string|null} time       - Time range (HH:MM–HH:MM) or null
 * @property {boolean}    isAllDay  - True when 00:00–23:59
 * @property {number|null} session   - Session number or null
 * @property {string|null} room      - Room code (OL / VC_n) or null
 * @property {string|null} dueDate   - Due-date string or null
 * @property {string|null} examName  - Exam label (THEORY:/LAB:) or null
 * @property {string|null} quizName  - Quiz label or null
 * @property {string|null} link      - Meeting link or null
 *
 * @typedef {Object} ScheduleDay
 * @property {string} date  - ISO date (YYYY-MM-DD)
 * @property {string} day   - Weekday label (e.g. "Mon")
 * @property {number} dayNum - Day of month
 * @property {ScheduleItem[]} items
 *
 * @typedef {Object} ScheduleData
 * @property {number} year
 * @property {number} month
 * @property {string} monthName
 * @property {ScheduleDay[]} days
 */

// ── Helpers ──────────────────────────────────────────────

/** Indonesian month-name → number mapping for due-date parsing. */
const MONTH_ID = {
  Januari:1, Februari:2, Maret:3, April:4, Mei:5, Juni:6,
  Juli:7, Agustus:8, September:9, Oktober:10, November:11, Desember:12,
};

/** English month-name → index (for URL fallback). */
const MONTH_EN = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

/**
 * Parse an Indonesian due-date string to ISO date.
 * Expected format: "18 Mei 2026, 12:00 GMT+7"
 * @param {string} str
 * @returns {string|null} YYYY-MM-DD or null
 */
function parseDueDateToISO(str) {
  const m = str.match(/(\d+)\s+(\w+)\s+(\d{4})/);
  if (!m) return null;
  const mo = MONTH_ID[m[2]];
  if (!mo) return null;
  return `${m[3]}-${String(mo).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`;
}

// ── Core Parser ──────────────────────────────────────────

/**
 * Scrape the Binusmaya schedule page and return structured data.
 * @returns {ScheduleData|null} Parsed schedule, or null if no schedule found.
 */
function parseSchedule() {
  const groups = document.querySelectorAll('.c-schedule-group-container');
  if (!groups.length) return null;

  // ── Determine year & month ─────────────────────────────
  let year  = new Date().getFullYear();
  let month = new Date().getMonth() + 1;

  const urlMatch = window.location.pathname.match(/\/schedule\/(\d{4})-(\d{1,2})/);
  if (urlMatch) {
    year  = parseInt(urlMatch[1]);
    month = parseInt(urlMatch[2]);
  } else {
    const btn = document.querySelector('.btn-month-toggle');
    const txt = btn?.textContent?.trim() || '';
    const m   = txt.match(/(\w+)\s+(\d{4})/);
    if (m) {
      const idx = MONTH_EN.indexOf(m[1]);
      if (idx >= 0) { month = idx + 1; year = parseInt(m[2]); }
    }
  }

  const monthName = new Date(year, month - 1, 1)
    .toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });

  // ── Parse schedule cards ───────────────────────────────
  const rawDays = [];

  groups.forEach(group => {
    const dayLabel = group.querySelector('.group-date-label')?.textContent?.trim() || '';
    const dayNum   = parseInt(group.querySelector('.group-date-number')?.textContent?.trim() || '0');
    if (!dayNum) return;

    const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(dayNum).padStart(2,'0')}`;
    const items   = [];

    group.querySelectorAll('.c-schedule-container').forEach(card => {
      const klass   = card.querySelector('.schedule-title')?.textContent?.trim() || '';
      const subject = card.querySelector('.schedule-desc')?.textContent?.trim()  || '';
      const modeEl  = card.querySelector('[class*="delivery-mode"]');
      const mode    = modeEl?.textContent?.trim() || '';
      const modeKey = [...(modeEl?.classList || [])].find(c =>
        ['online','virtual-class','other'].includes(c)) || 'other';

      const labels = [...card.querySelectorAll('.feature-label')]
        .map(el => el.textContent.trim()).filter(Boolean);

      let time = null, isAllDay = false, dueDate = null;
      let session = null, room = null, examName = null, quizName = null, link = null;

      labels.forEach(l => {
        const tMatch = l.match(/^(\d{2}:\d{2})\s*[-–]\s*(\d{2}:\d{2})/);
        if (tMatch) {
          if (tMatch[1] === '00:00' && tMatch[2] === '23:59') isAllDay = true;
          else time = `${tMatch[1]}–${tMatch[2]}`;
        }
        const due = l.match(/Due Date:\s*(.+)/i);
        if (due) dueDate = due[1].trim();
        const sess = l.match(/^Session\s+(\d+)$/i);
        if (sess) session = parseInt(sess[1]);
        if (l.startsWith('https://')) link = l;
        if (/THEORY:|LAB:/i.test(l)) examName = l;
        if (/^Quiz\s+/i.test(l)) quizName = l;
        if (/^(OL|VC_\d+)$/.test(l)) room = l;
      });

      // Granular type for filtering: online | virtual-class | quiz | exam
      let type = modeKey;
      if (modeKey === 'other') {
        if (quizName) type = 'quiz';
        else if (examName || mode.toLowerCase().includes('exam')) type = 'exam';
      }

      items.push({
        subject, class: klass, mode, modeKey, type,
        time, isAllDay, session, room, dueDate,
        examName, quizName, link,
      });
    });

    if (items.length) rawDays.push({ date: dateStr, day: dayLabel, dayNum, items });
  });

  // ── Deduplication ──────────────────────────────────────
  // Quiz/Exam entries appear on both their start date and their due date.
  // Strategy: for each unique (subject + quizName/examName) keep only
  // the first occurrence (start date), remove later duplicates.

  const dedupMap = new Map();

  rawDays.forEach((day, di) => {
    day.items.forEach((item, ii) => {
      if (item.type !== 'quiz' && item.type !== 'exam') return;
      const key = `${item.subject}__${item.quizName || item.examName || item.mode}`;

      if (!dedupMap.has(key)) {
        dedupMap.set(key, { date: day.date, di, ii });
        return;
      }

      // Keep the earlier entry (start date), remove the later one
      item.__remove = true;
    });
  });

  // Build cleaned days
  const days = rawDays.map(day => ({
    ...day,
    items: day.items.filter(i => !i.__remove),
  })).filter(d => d.items.length);

  return { year, month, monthName, days };
}

// ── Message Handler ──────────────────────────────────────

chrome.runtime.onMessage.addListener((req, _sender, sendResponse) => {
  if (req.action === 'getSchedule') {
    try {
      const data = parseSchedule();
      sendResponse({ success: !!data, data });
    } catch (e) {
      sendResponse({ success: false, error: e.message });
    }
  }
  return true; // keep message channel open for async
});
