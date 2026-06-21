/**
 * oracle-forms.js
 * Wisdom Oracle — Landing-page form logic
 *
 * Responsibilities:
 *   • handleGitaSubmit / handleGitaRandom — Gita verse lookup and random selection
 *   • handleIChingSubmit / handleIChingRandom — iChing hexagram lookup and random selection
 *   • initChapterSelect — custom dropdown for Gita chapter selection
 *   • getSelectedChapter / setSelectedChapter — dropdown state accessors
 *   • Input sanitization (digits and hyphens only for Gita grouped verses)
 *   • Error helpers (showError, clearErrors)
 *
 * Import rules: imports displayVerse and displayHexagram from lightbox.js.
 * Does NOT clear inputs or reset dropdown until after successful display.
 *
 * NOTE: Wisdom Oracle composite-reading logic (handleWisdomOracle, openOracleCard,
 * closeOracleCard, oracle.json loading) now lives in wisdomoracle.js, not here.
 * This file is intentionally scoped to the two single-oracle landing forms.
 */

'use strict';

import { 
  displayVerse, 
  displayHexagram,
} from './lightbox.js';

import {
  validateVerse, 
  randomVerse,
} from './gitacore.js';

import {
  validateHexagram, 
  randomHexagram,
} from './ichingcore.js';

// ─── Access shared state and DOM from app.js ────────────────────────────────
/** @returns {import('./app.js').AppState} */
const getState = () => window._woState;
/** @returns {Object} */
const getDom   = () => window._woDom;

// ─── Error helpers ──────────────────────────────────────────────────────────
/**
 * Show an error message in the appropriate oracle's error box.
 * Supports markdown-style bold wrapping with **text**.
 *
 * @param {string} msg — the error message to display
 * @param {'gita'|'iching'} [target] — which oracle's error box to use; defaults to current state.mode
 */
function showError(msg, target) {
  const dom = getDom();
  const state = getState();
  const box = (target ?? state.mode) === 'iching' ? dom.ichingErrorBox : dom.gitaErrorBox;
  box.innerHTML = msg.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  box.classList.add('visible');
  box.setAttribute('role', 'alert');
}

/**
 * Clear all visible error messages from both Gita and iChing forms.
 */
function clearErrors() {
  const dom = getDom();
  [dom.gitaErrorBox, dom.ichingErrorBox].forEach(b => {
    b.textContent = '';
    b.classList.remove('visible');
  });
}

// ─── Gita: form submit ────────────────────────────────────────────────────────

/**
 * Handles the Gita verse lookup form submission.
 * Validates chapter selection, verse input format, and range bounds.
 * Only clears inputs and resets dropdown after a successful displayVerse() call.
 *
 * @param {Event} e — the form submit event
 */
async function handleGitaSubmit(e) {
  e.preventDefault();
  clearErrors();

  const dom = getDom();
  const chapterNum = getSelectedChapter();

  if (!chapterNum) {
    showError('Please select a chapter from the dropdown.', 'gita');
    return;
  }

  const rawVerse = dom.gitaVerseInput.value.trim();

  // Spec: empty input → show error asking which verse (no silent default to 1)
  if (rawVerse === '') {
    showError('Which verse do you want to read?', 'gita');
    return;
  }

  // Validate format: digits and hyphens only, no trailing hyphen, no multiple hyphens
  if (!/^\d+(?:-\d+)?$/.test(rawVerse)) {
    showError('Please enter a valid verse number (e.g. 4, 23, or 26-27).', 'gita');
    return;
  }

  // Validate the verse reference against chapter metadata
  const { valid, ref } = validateVerse(chapterNum, rawVerse);
  if (!valid) {
    showError(ref, 'gita');
    return;
  }

  // Attempt to display; only clear inputs on success
  try {
    await displayVerse(chapterNum, ref);
    // Clear inputs and dropdown only after successful lookup
    dom.gitaVerseInput.value = '';
    setSelectedChapter(null);
  } catch (err) {
    // displayVerse already shows the error in the lightbox or landing page;
    // preserve user input so they can correct it.
    console.error('[handleGitaSubmit]', err);
  }
}

// ─── Gita: random verse (SILENT — does NOT touch inputs or dropdown) ──────────

/**
 * Selects a random verse across all 18 chapters and displays it.
 * Does not modify the chapter dropdown or verse input.
 */
async function handleGitaRandom() {
  clearErrors();
  try {
    // randomVerse() picks chapter + ref internally; inputs are NOT updated
    const { chapter, ref } = randomVerse();
    await displayVerse(chapter, ref);
  } catch (err) {
    console.error('[handleGitaRandom]', err);
    showError('Failed to load random verse: ' + err.message, 'gita');
  }
}

// ─── iChing: form submit / toss coins ────────────────────────────────────────

/**
 * Handles the iChing hexagram lookup form submission.
 * Empty input triggers a random hexagram (the "toss coins" experience).
 * A number input looks up that specific hexagram (1–64).
 * Only clears the input after a successful displayHexagram() call.
 *
 * @param {Event} e — the form submit event
 */
async function handleIChingSubmit(e) {
  e.preventDefault();
  clearErrors();

  const dom = getDom();
  const rawInput = dom.ichingInput.value.trim();

  if (rawInput === '') {
    // Empty input → random hexagram (the "toss coins" experience)
    const { ref } = randomHexagram();
    try {
      await displayHexagram(ref);
      // Keep input empty (spec)
    } catch (err) {
      console.error('[handleIChingSubmit] random:', err);
    }
    return;
  }

  if (!/^\d+$/.test(rawInput)) {
    showError('Please enter a whole number (1–64).', 'iching');
    return;
  }

  const { valid, ref } = validateHexagram(rawInput);
  if (!valid) {
    showError(ref, 'iching');
    return;
  }

  // Attempt to display; only clear input on success
  try {
    await displayHexagram(ref);
    dom.ichingInput.value = '';
  } catch (err) {
    console.error('[handleIChingSubmit]', err);
    // Preserve input on failure so user can correct
  }
}

// ─── iChing: random button (SILENT — does NOT touch input) ───────────────────

/**
 * Selects a random hexagram from 1–64 and displays it.
 * Does not modify the hexagram input field.
 */
async function handleIChingRandom() {
  clearErrors();
  try {
    const { ref } = randomHexagram();
    await displayHexagram(ref);
  } catch (err) {
    console.error('[handleIChingRandom]', err);
    showError('Failed to load hexagram: ' + err.message, 'iching');
  }
}

// ─── Custom chapter dropdown (Gita) ──────────────────────────────────────────

/**
 * Manages the custom <div> dropdown for Gita chapter selection.
 * Exposes on window:
 *   window._getSelectedChapter() → number | null
 *   window._setSelectedChapter(n) — programmatic select / null to reset
 */
function initChapterSelect() {
  const dom = getDom();
  const wrap     = document.getElementById('chapter-select');
  const trigger  = document.getElementById('chapter-trigger');
  const trigText = document.getElementById('chapter-trigger-text');
  const list     = document.getElementById('chapter-list');
  const options  = Array.from(list.querySelectorAll('.custom-select-option'));

  let selectedValue = null; // integer | null

  /**
   * Opens the dropdown list and sets ARIA expanded state.
   */
  function openList() {
    wrap.classList.add('open');
    trigger.setAttribute('aria-expanded', 'true');
  }

  /**
   * Closes the dropdown list and clears ARIA expanded state.
   */
  function closeList() {
    wrap.classList.remove('open');
    trigger.setAttribute('aria-expanded', 'false');
  }

  /**
   * Selects a chapter option or clears the selection.
   * When selecting, clears the verse input so the user enters a fresh number.
   *
   * @param {HTMLElement|null} opt — the option element to select, or null to clear
   */
  function selectOption(opt) {
    if (!opt) {
      // Reset / clear selection
      selectedValue = null;
      trigText.textContent = 'Select a Gītā Wisdom Chapter here';
      options.forEach(o => o.removeAttribute('aria-selected'));
      closeList();
      return;
    }
    selectedValue = parseInt(opt.dataset.value, 10);
    trigText.textContent = `Ch. ${selectedValue}`;
    options.forEach(o => o.removeAttribute('aria-selected'));
    opt.setAttribute('aria-selected', 'true');
    // Clear verse input when chapter changes (spec: no trailing number)
    dom.gitaVerseInput.value = '';
    dom.gitaVerseInput.focus();
    closeList();
  }

  // Expose accessors on window for cross-module use
  window._getSelectedChapter = () => selectedValue;
  window._setSelectedChapter = (chapter) => {
    if (chapter === null) { selectOption(null); return; }
    const opt = list.querySelector(`[data-value="${chapter}"]`);
    if (opt) selectOption(opt);
  };

  trigger.addEventListener('click', () => {
    wrap.classList.contains('open') ? closeList() : openList();
  });

  options.forEach(opt => opt.addEventListener('click', () => selectOption(opt)));

  document.addEventListener('click', e => {
    if (!wrap.contains(e.target)) closeList();
  });

  document.getElementById('chapter-backdrop')
      .addEventListener('click', closeList);

  trigger.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openList(); }
  });

  list.addEventListener('keydown', e => {
    const current = list.querySelector('[aria-selected="true"]') || options[0];
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = current.nextElementSibling;
      if (next) { selectOption(next); next.scrollIntoView({ block: 'nearest' }); }
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = current.previousElementSibling;
      if (prev) { selectOption(prev); prev.scrollIntoView({ block: 'nearest' }); }
    }
    if (e.key === 'Escape') closeList();
    if (e.key === 'Enter')  closeList();
  });
}

// ─── Exports ──────────────────────────────────────────────────────────────────
export function getSelectedChapter() {
  return window._getSelectedChapter();
}

export function setSelectedChapter(n) {
  return window._setSelectedChapter(n);
}

export {
  handleGitaSubmit,
  handleGitaRandom,
  handleIChingSubmit,
  handleIChingRandom,
  initChapterSelect,
  showError,
  clearErrors,
};