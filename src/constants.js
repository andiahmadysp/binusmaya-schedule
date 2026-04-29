/**
 * Shared constants for BINUS Schedule extension.
 * Centralises type definitions, UI config, and storage keys.
 */

/** @enum {string} Schedule event types produced by content.js */
export const EventType = Object.freeze({
  ONLINE:       'online',
  VIRTUAL_CLASS: 'virtual-class',
  QUIZ:         'quiz',
  EXAM:         'exam',
});

/**
 * Per-type UI configuration.
 * Keeps popup.js render logic declarative and DRY.
 */
export const TYPE_CONFIG = Object.freeze({
  [EventType.ONLINE]: {
    label:   'Online',
    tag:     'OL',
    barClass: 'bar-online',
    tagClass: 'tag-online',
    dotClass: 'dot-online',
  },
  [EventType.VIRTUAL_CLASS]: {
    label:   'Virtual Class',
    tag:     'VC',
    barClass: 'bar-vc',
    tagClass: 'tag-vc',
    dotClass: 'dot-vc',
  },
  [EventType.QUIZ]: {
    label:   'Quiz',
    tag:     'Quiz',
    barClass: 'bar-quiz',
    tagClass: 'tag-quiz',
    dotClass: 'dot-quiz',
  },
  [EventType.EXAM]: {
    label:   'Exam',
    tag:     'Exam',
    barClass: 'bar-exam',
    tagClass: 'tag-exam',
    dotClass: 'dot-exam',
  },
});

/** chrome.storage key for schedule cache */
export const STORAGE_KEY = 'bimay_schedule_cache';

/** Cache time-to-live in milliseconds (5 min) */
export const CACHE_TTL_MS = 5 * 60 * 1000;

/** ICS calendar product identifier */
export const ICS_PRODID = '-//Binusmaya Schedule//EN';

/** ICS timezone reference */
export const ICS_TIMEZONE = 'Asia/Jakarta';
