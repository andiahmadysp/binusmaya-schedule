/**
 * Export utilities — JSON and ICS calendar format.
 *
 * ICS is the universal calendar exchange format compatible with
 * Google Calendar, Outlook, Apple Calendar, and most third-party apps.
 */

import { ICS_PRODID, ICS_TIMEZONE, EventType } from './constants.js';

const CRLF = '\r\n';

// ── ICS Helpers ──────────────────────────────────────────

/** Escape special characters per ICS spec (RFC 5545). */
function escapeICS(text) {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/** Format ISO date (YYYY-MM-DD) → ICS date (YYYYMMDD). */
function fmtDate(dateStr) {
  return dateStr.replace(/-/g, '');
}

/**
 * Parse time range from content.js format (HH:MM–HH:MM).
 * @returns {{ start: string, end: string } | null}
 */
function parseTimeICS(timeStr) {
  if (!timeStr) return null;
  const m = timeStr.match(/^(\d{2}):(\d{2})\s*[–-]\s*(\d{2}):(\d{2})$/);
  if (!m) return null;
  return { start: `${m[1]}${m[2]}00`, end: `${m[3]}${m[4]}00` };
}

/** Generate a stable UID for a given event. */
function eventUID(dayDate, item, index) {
  const slug = item.subject.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `binus-${fmtDate(dayDate)}-${slug}-${index}@bimay-schedule`;
}

/** VTIMEZONE block for Asia/Jakarta (WIB, UTC+7, no DST). */
function vTimezone() {
  return [
    'BEGIN:VTIMEZONE',
    'TZID:Asia/Jakarta',
    'BEGIN:STANDARD',
    'DTSTART:19700101T000000',
    'TZOFFSETFROM:+0700',
    'TZOFFSETTO:+0700',
    'TZNAME:WIB',
    'END:STANDARD',
    'END:VTIMEZONE',
  ].join(CRLF);
}

/**
 * Build a single VEVENT block.
 * @param {string} dayDate  - ISO date string (YYYY-MM-DD)
 * @param {Object} item     - Schedule item from content.js
 * @param {number} index    - Item index within the day (for UID uniqueness)
 * @returns {string}
 */
function vEvent(dayDate, item, index) {
  const lines = ['BEGIN:VEVENT', `UID:${eventUID(dayDate, item, index)}`];

  // Summary
  let summary = item.subject;
  if (item.examName) summary += ` — ${item.examName}`;
  else if (item.quizName) summary += ` — ${item.quizName}`;
  lines.push(`SUMMARY:${escapeICS(summary)}`);

  // Description
  const descParts = [];
  if (item.class)   descParts.push(`Class: ${item.class}`);
  if (item.session) descParts.push(`Session: ${item.session}`);
  if (item.room)    descParts.push(`Room: ${item.room}`);
  if (item.dueDate) descParts.push(`Due: ${item.dueDate}`);
  if (item.link)    descParts.push(item.link);
  if (descParts.length) {
    lines.push(`DESCRIPTION:${escapeICS(descParts.join('\\n'))}`);
  }

  // Location
  if (item.room) {
    lines.push(`LOCATION:${escapeICS(item.room)}`);
  }

  // Date/Time
  if (item.isAllDay) {
    lines.push(`DTSTART;VALUE=DATE:${fmtDate(dayDate)}`);
    const next = new Date(dayDate);
    next.setDate(next.getDate() + 1);
    lines.push(`DTEND;VALUE=DATE:${fmtDate(next.toISOString().split('T')[0])}`);
  } else if (item.time) {
    const parsed = parseTimeICS(item.time);
    if (parsed) {
      lines.push(`DTSTART;TZID=${ICS_TIMEZONE}:${fmtDate(dayDate)}T${parsed.start}`);
      lines.push(`DTEND;TZID=${ICS_TIMEZONE}:${fmtDate(dayDate)}T${parsed.end}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${fmtDate(dayDate)}`);
    }
  } else {
    lines.push(`DTSTART;VALUE=DATE:${fmtDate(dayDate)}`);
  }

  // Reminder alarm for quizzes/exams with due dates
  if (item.dueDate) {
    lines.push('BEGIN:VALARM');
    lines.push('TRIGGER:-PT15M');
    lines.push('ACTION:DISPLAY');
    lines.push(`DESCRIPTION:${escapeICS(`Due: ${item.dueDate}`)}`);
    lines.push('END:VALARM');
  }

  lines.push('END:VEVENT');
  return lines.join(CRLF);
}

// ── Public API ───────────────────────────────────────────

/**
 * Generate ICS calendar string from schedule data.
 * @param {Object} data        - Schedule data from content.js
 * @param {Set<string>} activeTypes - Active type filters
 * @returns {string} ICS calendar content
 */
export function generateICS(data, activeTypes) {
  const events = [];

  data.days.forEach(day => {
    day.items.forEach((item, i) => {
      if (!activeTypes.has(item.type)) return;
      events.push(vEvent(day.date, item, i));
    });
  });

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${ICS_PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    vTimezone(),
    ...events,
    'END:VCALENDAR',
  ].join(CRLF);
}

/**
 * Generate pretty-printed JSON from schedule data.
 * @param {Object} data        - Schedule data from content.js
 * @param {Set<string>} activeTypes - Active type filters
 * @returns {string} JSON string
 */
export function generateJSON(data, activeTypes) {
  const filtered = {
    month: data.monthName,
    year: data.year,
    days: data.days.map(day => ({
      ...day,
      items: day.items.filter(i => activeTypes.has(i.type)),
    })).filter(d => d.items.length),
  };
  return JSON.stringify(filtered, null, 2);
}

/**
 * Trigger a browser file download.
 * @param {string} content   - File content
 * @param {string} filename  - Suggested file name
 * @param {string} mimeType  - MIME type
 */
export function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
