/**
 * BINUS Schedule — Popup UI Controller
 * Entry point for the extension popup (ES module).
 */

import { TYPE_CONFIG, EventType } from './src/constants.js';
import { icons } from './src/icons.js';
import { generateJSON, generateICS, downloadFile } from './src/export.js';
import { cacheSchedule, loadCachedSchedule } from './src/storage.js';

// ── State ────────────────────────────────────────────────

let scheduleData = null;

// ── DOM Helpers ──────────────────────────────────────────

const $ = (id) => document.getElementById(id);

// ── View Management ──────────────────────────────────────

const VIEWS = ['view-loading', 'view-empty', 'view-error', 'view-schedule'];

function showView(id) {
  VIEWS.forEach(v => {
    const el = $(v);
    if (el) el.style.display = 'none';
  });
  const target = $(id);
  if (target) target.style.display = '';
}

// ── Filters ──────────────────────────────────────────────

function getActiveTypes() {
  return new Set(
    [...document.querySelectorAll('#filter-row .filter-btn.active')]
      .map(btn => btn.dataset.type)
  );
}

// ── Render ───────────────────────────────────────────────

function today() {
  return new Date().toISOString().split('T')[0];
}

function render(data) {
  scheduleData = data;

  $('month-label').textContent = data.monthName.toUpperCase();

  // Show export buttons
  $('btn-copy').style.display = 'flex';
  $('btn-ics').style.display = 'flex';

  const list = $('list');
  list.innerHTML = '';

  const todayStr = today();
  let totalEvents = 0;
  let firstTodayEl = null;

  data.days.forEach(day => {
    const group = document.createElement('div');
    group.className = 'day-group';
    group.dataset.date = day.date;

    const isToday = day.date === todayStr;

    // Day header
    const header = document.createElement('div');
    header.className = 'day-header';
    header.innerHTML = `
      <span class="day-name">${day.day}</span>
      <span class="day-num${isToday ? ' is-today' : ''}">${day.dayNum}</span>
      <span class="today-pip">Today</span>
      <span class="day-divider"></span>
    `;
    group.appendChild(header);

    day.items.forEach(item => {
      const row = document.createElement('div');
      row.className = 'event-row';
      row.dataset.type = item.type;

      const config = TYPE_CONFIG[item.type] || TYPE_CONFIG[EventType.EXAM];

      // Build detail parts — SVG icons only, no emojis
      const parts = [];
      if (item.time)      parts.push(`<span class="detail time">${icons.clock} ${item.time} WIB</span>`);
      if (item.isAllDay)  parts.push(`<span class="detail">${icons.sun} All day</span>`);
      if (item.session)   parts.push(`<span class="detail">Session ${item.session}</span>`);
      if (item.dueDate)   parts.push(`<span class="detail due">${icons.alertTriangle} ${item.dueDate}</span>`);
      if (item.examName)  parts.push(`<span class="detail">${item.examName}</span>`);
      if (item.quizName)  parts.push(`<span class="detail">${item.quizName}</span>`);
      parts.push(`<span class="detail">${item.class}</span>`);

      const detailsHtml = parts.join('<span class="detail-sep">\u00B7</span>');

      row.innerHTML = `
        <div class="event-type-bar ${config.barClass}"></div>
        <div class="event-content">
          <div class="event-subject">${item.subject}</div>
          <div class="event-details">${detailsHtml}</div>
        </div>
        <span class="event-tag ${config.tagClass}">${config.tag}</span>
      `;

      group.appendChild(row);
      totalEvents++;
    });

    list.appendChild(group);

    if (isToday && !firstTodayEl) {
      firstTodayEl = group;
    }
  });

  $('count-label').textContent = `${totalEvents} kegiatan`;
  applyFilters();
  showView('view-schedule');

  // Auto-scroll to today
  if (firstTodayEl) {
    requestAnimationFrame(() => {
      firstTodayEl.scrollIntoView({ block: 'start', behavior: 'instant' });
    });
  }
}

function applyFilters() {
  const active = getActiveTypes();
  let visible = 0;

  document.querySelectorAll('.event-row').forEach(row => {
    const show = active.has(row.dataset.type);
    row.dataset.hidden = show ? '0' : '1';
    if (show) visible++;
  });

  // Hide day groups with no visible events
  document.querySelectorAll('.day-group').forEach(group => {
    const hasVisible = [...group.querySelectorAll('.event-row')]
      .some(r => r.dataset.hidden !== '1');
    group.dataset.visible = hasVisible ? '1' : '0';
  });

  $('count-label').textContent = `${visible} kegiatan`;
}

// ── Export Actions ────────────────────────────────────────

function handleCopyJSON() {
  if (!scheduleData) return;
  const active = getActiveTypes();
  const json = generateJSON(scheduleData, active);

  navigator.clipboard.writeText(json).then(() => {
    const btn = $('btn-copy');
    const lbl = $('copy-text');
    btn.classList.add('success');
    lbl.textContent = 'Copied!';
    setTimeout(() => {
      btn.classList.remove('success');
      lbl.textContent = 'JSON';
    }, 2000);
  });
}

function handleExportICS() {
  if (!scheduleData) return;
  const active = getActiveTypes();
  const ics = generateICS(scheduleData, active);
  const filename = `binus-schedule-${scheduleData.year}-${String(scheduleData.month).padStart(2, '0')}.ics`;
  downloadFile(ics, filename, 'text/calendar;charset=utf-8');
}

// ── Init ─────────────────────────────────────────────────

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.url?.includes('lms.binus.ac.id')) {
    showView('view-empty');
    return;
  }

  // Show cached data immediately if available
  const cached = await loadCachedSchedule();
  if (cached?.days?.length) {
    render(cached);
  }

  // Inject content script (idempotent if already loaded)
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['src/content.js'],
    });
  } catch (_) { /* may already be injected */ }

  // Request fresh data
  chrome.tabs.sendMessage(tab.id, { action: 'getSchedule' }, res => {
    if (chrome.runtime.lastError) {
      // Content script unreachable
      if (!cached) {
        $('error-message').textContent = 'Could not read the page. Make sure you are on the Schedule tab.';
        showView('view-error');
      }
      return;
    }

    if (!res?.success || !res.data?.days?.length) {
      if (!cached) showView('view-empty');
      return;
    }

    render(res.data);
    cacheSchedule(res.data);
  });
}

// ── Event Listeners ──────────────────────────────────────

document.querySelectorAll('#filter-row .filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    btn.classList.toggle('active');
    applyFilters();
  });
});

$('btn-copy').addEventListener('click', handleCopyJSON);
$('btn-ics').addEventListener('click', handleExportICS);
$('btn-retry').addEventListener('click', init);

init();
