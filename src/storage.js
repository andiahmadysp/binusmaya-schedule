/**
 * Schedule caching via chrome.storage.local.
 * Enables faster popup loads and brief offline access.
 */

import { STORAGE_KEY, CACHE_TTL_MS } from './constants.js';

/**
 * Persist schedule data with a timestamp.
 * @param {Object} data - Schedule data from content.js
 */
export async function cacheSchedule(data) {
  try {
    await chrome.storage.local.set({
      [STORAGE_KEY]: { data, timestamp: Date.now() },
    });
  } catch (e) {
    console.warn('[storage] Failed to cache schedule:', e);
  }
}

/**
 * Retrieve cached schedule data if still within TTL.
 * @returns {Promise<Object|null>}
 */
export async function loadCachedSchedule() {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const cached = result[STORAGE_KEY];
    if (!cached) return null;
    if (Date.now() - cached.timestamp > CACHE_TTL_MS) return null;
    return cached.data;
  } catch (e) {
    console.warn('[storage] Failed to load cache:', e);
    return null;
  }
}
