import { ALT_TEXT_MODES, BROWSE_MODES, KEYBOARD_SHORTCUTS, PROGRESS_DISPLAY_MODES, RATING_DISPLAY_MODES } from '../shared/constants.js';
import { isSyncWriteRateLimitError } from '../shared/errors.js';
import { calculateNavigation, getComicUrl, getExplainXkcdUrl } from '../shared/navigation.js';
import { calculateProgress, getComicState, isValidComicId } from '../shared/comic-state.js';
import { formatCompactProgressSummary } from '../shared/progress-format.js';
import { formatPreviewRatingValue, getRatingButtons } from '../shared/rating-control.js';
import { storageService } from '../storage/storage-service.js';
import { metadataCache } from '../storage/metadata-cache.js';

const PANEL_ID = 'xrt-panel';
const NAV_ACTIONS = Object.freeze({
  first: { label: '|<', title: 'First' },
  previous: { label: '< Prev', title: 'Previous' },
  random: { label: 'Random', title: 'Random' },
  next: { label: 'Next >', title: 'Next' },
  last: { label: '>|', title: 'Last' },
});

const LABELS = Object.freeze({
  themed: Object.freeze({
    read: 'Got it',
    favorite: 'Neat',
    explain: 'Huh?',
  }),
  generic: Object.freeze({
    read: 'Read',
    favorite: 'Fav',
    explain: 'Explain',
  }),
});

let snapshot = null;
let currentComic = null;
let browseMode = BROWSE_MODES.ALL;
let panel = null;
let altRevealed = false;
let altRevealAnimationPending = false;
let autoReadTimer = null;
let autoReadTimerArmed = false;
let altTextTimer = null;
let refreshQueued = false;
let dashboardUrl = '';
let localSyncWriteDepth = 0;
let comicMutationPending = false;

/**
 * @param {unknown} error
 */
function logNonFatal(error) {
  if (isSyncWriteRateLimitError(error)) {
    return;
  }
  console.warn('[xkcd tracker]', error);
}

/**
 * @param {string} tagName
 * @param {{ className?: string, text?: string, attrs?: Record<string, string>, children?: Node[] }} [options]
 * @returns {HTMLElement}
 */
function element(tagName, options = {}) {
  const node = document.createElement(tagName);
  if (options.className) {
    node.className = options.className;
  }
  if (options.text != null) {
    node.textContent = options.text;
  }
  if (options.attrs) {
    for (const [name, value] of Object.entries(options.attrs)) {
      node.setAttribute(name, value);
    }
  }
  if (options.children) {
    node.append(...options.children);
  }
  return node;
}

/**
 * @param {string} text
 * @param {() => void | Promise<void>} onClick
 * @param {{ pressed?: boolean, disabled?: boolean, title?: string, className?: string }} [options]
 * @returns {HTMLButtonElement}
 */
function button(text, onClick, options = {}) {
  const node = /** @type {HTMLButtonElement} */ (element('button', {
    className: options.className,
    text,
    attrs: {
      type: 'button',
      title: options.title ?? text,
    },
  }));
  if (options.pressed != null) {
    node.setAttribute('aria-pressed', String(options.pressed));
  }
  node.disabled = Boolean(options.disabled);
  node.addEventListener('click', async () => {
    try {
      await onClick();
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error), 'error');
      logNonFatal(error);
    }
  });
  return node;
}

/**
 * @param {string} text
 * @param {'info' | 'error'} [kind]
 */
function showMessage(text, kind = 'info') {
  if (!panel) {
    return;
  }
  const existing = panel.querySelector('.xrt-message');
  existing?.remove();
  const message = element('p', { className: `xrt-message xrt-message-${kind}`, text });
  panel.append(message);
}

/**
 * @param {unknown} message
 * @returns {Promise<any>}
 */
async function sendRuntimeMessage(message) {
  try {
    return await chrome.runtime.sendMessage(message);
  } catch {
    return null;
  }
}

/**
 * Suppresses the storage-change echo caused by a write from this page.
 * @template T
 * @param {() => Promise<T>} operation
 * @returns {Promise<T>}
 */
async function runLocalSyncWrite(operation) {
  localSyncWriteDepth += 1;
  try {
    return await operation();
  } finally {
    window.setTimeout(() => {
      localSyncWriteDepth = Math.max(0, localSyncWriteDepth - 1);
    }, 0);
  }
}

/**
 * @returns {string}
 */
function getDashboardUrl() {
  if (dashboardUrl) {
    return dashboardUrl;
  }

  try {
    dashboardUrl = chrome.runtime.getURL('src/dashboard/dashboard.html');
  } catch (error) {
    logNonFatal(error);
  }

  return dashboardUrl;
}

async function reportComicPageDetected() {
  if (!currentComic || !snapshot || !isValidComicId(currentComic.id, snapshot.meta.latestKnownComicId)) {
    return;
  }

  await sendRuntimeMessage({ type: 'xrt:comic-page-detected', comicId: currentComic.id });
}

/**
 * @returns {number | null}
 */
function getComicIdFromPermanentLink() {
  const anchors = [...document.querySelectorAll('a[href]')];
  for (const anchor of anchors) {
    const text = anchor.textContent?.trim() ?? '';
    if (!/^https?:\/\/(?:www\.)?xkcd\.com\/\d+\/?$/.test(text)) {
      continue;
    }

    const id = getComicIdFromUrl(anchor.href);
    if (id !== null) {
      return id;
    }
  }

  return null;
}

/**
 * @param {string} url
 * @returns {number | null}
 */
function getComicIdFromUrl(url) {
  try {
    const parsed = new URL(url);
    if (!/(^|\.)xkcd\.com$/.test(parsed.hostname)) {
      return null;
    }
    const match = parsed.pathname.match(/^\/(\d+)\/?$/);
    if (!match) {
      return null;
    }
    const id = Number(match[1]);
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

/**
 * @returns {Promise<{ id: number, title: string, alt: string, imageUrl: string } | null>}
 */
async function readCurrentComic() {
  const image = /** @type {HTMLImageElement | null} */ (document.querySelector('#comic img'));
  const title = document.querySelector('#ctitle')?.textContent?.trim() ?? document.title.replace(/^\s*xkcd:\s*/i, '').trim();
  const permalinkId = getComicIdFromPermanentLink();
  const urlId = getComicIdFromUrl(window.location.href);
  let id = permalinkId ?? urlId;
  let metadata = null;

  if (id === null && window.location.pathname === '/') {
    try {
      metadata = await metadataCache.fetchLatestComicMetadata();
      id = metadata.num;
    } catch (error) {
      logNonFatal(error);
    }
  }

  if (id === null) {
    return null;
  }

  return {
    id,
    title: metadata?.title ?? title,
    alt: metadata?.alt ?? image?.getAttribute('title') ?? image?.alt ?? '',
    imageUrl: metadata?.img ?? image?.src ?? '',
  };
}

/**
 * @param {number} currentId
 * @returns {Promise<void>}
 */
async function ensureLatestKnown(currentId) {
  snapshot = await storageService.getTrackerSnapshot();
  if (snapshot.meta.latestKnownComicId && snapshot.meta.latestKnownComicId >= currentId) {
    return;
  }

  try {
    const latest = await metadataCache.fetchLatestComicMetadata();
    const patch = {
      latestKnownComicId: latest.num,
      latestCheckedAt: new Date().toISOString(),
    };
    if (!snapshot.meta.latestKnownComicId && !snapshot.meta.lastNewComicId) {
      patch.acknowledgedLatestComicId = latest.num;
      patch.lastNewComicId = null;
    }
    await storageService.updateMeta(patch);
  } catch (error) {
    logNonFatal(error);
    const patch = {
      latestKnownComicId: currentId,
      latestCheckedAt: new Date().toISOString(),
    };
    if (!snapshot.meta.latestKnownComicId && !snapshot.meta.lastNewComicId) {
      patch.acknowledgedLatestComicId = currentId;
      patch.lastNewComicId = null;
    }
    await storageService.updateMeta(patch);
  }
  snapshot = await storageService.getTrackerSnapshot();
}

/**
 * @param {number} delaySeconds
 * @param {() => void | Promise<void>} callback
 * @returns {() => void}
 */
function startActiveTimer(delaySeconds, callback) {
  const requiredMs = Math.max(0, delaySeconds) * 1000;
  let activeMs = 0;
  let lastTick = performance.now();
  let cancelled = false;
  let timeoutId = 0;

  const isActive = () => document.visibilityState === 'visible' && document.hasFocus();
  const cancel = () => {
    cancelled = true;
    window.clearTimeout(timeoutId);
  };
  const tick = async () => {
    if (cancelled) {
      return;
    }

    const now = performance.now();
    if (isActive()) {
      activeMs += now - lastTick;
    }
    lastTick = now;

    if (activeMs >= requiredMs) {
      cancel();
      try {
        await callback();
      } catch (error) {
        logNonFatal(error);
      }
      return;
    }

    timeoutId = window.setTimeout(tick, 250);
  };

  timeoutId = window.setTimeout(tick, 250);
  return cancel;
}

function cancelAutoReadTimer() {
  autoReadTimer?.();
  autoReadTimer = null;
  autoReadTimerArmed = true;
}

/**
 * @returns {HTMLElement}
 */
function ensurePanel() {
  const existing = document.getElementById(PANEL_ID);
  if (existing) {
    panel = existing;
    return existing;
  }

  const root = element('section', {
    attrs: {
      id: PANEL_ID,
      'aria-label': 'xkcd reading tracker',
    },
  });
  const comic = document.querySelector('#comic');
  const target = comic ?? document.querySelector('#middleContainer') ?? document.body;
  target.insertAdjacentElement(comic ? 'afterend' : 'beforeend', root);
  panel = root;
  syncPageStyleVariables();
  return root;
}

function syncPageStyleVariables() {
  if (!panel) {
    return;
  }

  const pageStyle = getPageStyleSnapshot();

  for (const target of [panel, document.documentElement]) {
    for (const [property, value] of Object.entries(pageStyle)) {
      target.style.setProperty(property, value);
    }
  }
}

/**
 * @returns {Record<string, string>}
 */
function getPageStyleSnapshot() {
  const bodyStyle = getComputedStyle(document.body);
  const middleContainer = document.querySelector('#middleContainer');
  const middleStyle = middleContainer ? getComputedStyle(middleContainer) : null;
  const navLink = document.querySelector('.comicNav a');
  const pageLink = [...document.querySelectorAll('#middleContainer a[href]')]
    .find((link) => !link.closest('.comicNav') && !link.closest(`#${PANEL_ID}`));
  const navStyle = navLink ? getComputedStyle(navLink) : null;
  const pageLinkStyle = pageLink ? getComputedStyle(pageLink) : null;
  const pageStyle = {
    '--xrt-page-bg': bodyStyle.backgroundColor,
    '--xrt-bg': middleStyle?.backgroundColor ?? bodyStyle.backgroundColor,
    '--xrt-text': middleStyle?.color ?? bodyStyle.color,
    '--xrt-border': middleStyle?.borderColor ?? bodyStyle.color,
    '--xrt-soft-border': bodyStyle.backgroundColor,
  };

  if (navStyle) {
    Object.assign(pageStyle, {
      '--xrt-nav-bg': navStyle.backgroundColor,
      '--xrt-nav-color': navStyle.color,
      '--xrt-nav-border': navStyle.borderColor,
      '--xrt-nav-radius': navStyle.borderRadius,
      '--xrt-nav-font-weight': navStyle.fontWeight,
      '--xrt-nav-padding': navStyle.padding,
      '--xrt-nav-margin': navStyle.margin,
      '--xrt-nav-shadow': navStyle.boxShadow,
      '--xrt-nav-font-size': navStyle.fontSize,
      '--xrt-nav-hover-bg': navStyle.color,
      '--xrt-nav-hover-color': navStyle.backgroundColor,
    });
  }

  if (pageLinkStyle) {
    Object.assign(pageStyle, {
      '--xrt-link': pageLinkStyle.color,
      '--xrt-link-color': pageLinkStyle.color,
      '--xrt-link-font-weight': pageLinkStyle.fontWeight,
      '--xrt-link-text-decoration': pageLinkStyle.textDecorationLine,
    });
  }

  return pageStyle;
}

/**
 * @returns {Promise<void>}
 */
async function loadBrowseMode() {
  const response = await sendRuntimeMessage({
    type: 'xrt:get-tab-browse-mode',
    defaultMode: snapshot?.settings.navigation.defaultBrowseMode ?? BROWSE_MODES.ALL,
  });
  browseMode = response?.mode ?? snapshot?.settings.navigation.defaultBrowseMode ?? BROWSE_MODES.ALL;
}

/**
 * @param {import('../shared/types.js').BrowseMode} mode
 * @returns {Promise<void>}
 */
async function setBrowseMode(mode) {
  browseMode = mode;
  await sendRuntimeMessage({ type: 'xrt:set-tab-browse-mode', mode });
  panel?.querySelector('.xrt-mode-row')?.replaceWith(renderModeControls());
  renderNavigation();
  renderBrowseModeNotice();
}

/**
 * @param {EventTarget | null} target
 * @returns {boolean}
 */
function isEditableShortcutTarget(target) {
  return target instanceof HTMLElement
    && Boolean(target.closest('input, textarea, select, [contenteditable="true"], [contenteditable="plaintext-only"]'));
}

async function runComicMutation(operation, { cancelTimer = true } = {}) {
  if (comicMutationPending) {
    return false;
  }

  comicMutationPending = true;
  if (cancelTimer) {
    cancelAutoReadTimer();
  }
  try {
    await runLocalSyncWrite(operation);
    return true;
  } finally {
    comicMutationPending = false;
  }
}

/**
 * @param {Partial<import('../shared/types.js').ComicState>} patch
 * @param {{ progress?: boolean, continuePoint?: boolean, navigation?: boolean }} renderOptions
 * @param {{ cancelTimer?: boolean }} [mutationOptions]
 * @returns {Promise<boolean>}
 */
async function applyCurrentComicPatch(patch, renderOptions, mutationOptions = {}) {
  const changed = await runComicMutation(async () => {
    snapshot = await storageService.updateComicState(currentComic.id, patch);
  }, mutationOptions);
  if (changed) {
    renderCurrentComicState(renderOptions);
  }
  return changed;
}

async function toggleCurrentRead() {
  const state = getComicState(snapshot.comics, currentComic.id);
  await applyCurrentComicPatch(
    { read: !state.read },
    { progress: true, continuePoint: true, navigation: true }
  );
}

async function toggleCurrentFavorite() {
  const state = getComicState(snapshot.comics, currentComic.id);
  await applyCurrentComicPatch({ favorite: !state.favorite }, { navigation: true });
}

async function setCurrentContinuePoint() {
  const state = getComicState(snapshot.comics, currentComic.id);
  if (state.read) {
    showMessage('Read comics cannot be set as the continue point.', 'info');
    return;
  }
  if (snapshot.meta.continuePoint === currentComic.id) {
    showMessage(`Comic #${currentComic.id} is already the continue point.`, 'info');
    return;
  }

  const changed = await runComicMutation(async () => {
    await storageService.setContinuePoint(currentComic.id);
    snapshot = await storageService.getTrackerSnapshot();
  });
  if (changed) {
    renderCurrentComicState({ continuePoint: true });
    showMessage(`Continue point set to #${currentComic.id}.`);
  }
}

/**
 * @param {number | null} rating
 */
async function setCurrentRating(rating) {
  await applyCurrentComicPatch({ rating }, {});
}

/**
 * @param {'previous' | 'next'} role
 */
function navigateShortcut(role) {
  const nav = calculateNavigation({
    mode: browseMode,
    currentId: currentComic.id,
    state: snapshot.comics,
    latestComicId: snapshot.meta.latestKnownComicId,
  });
  const targetId = nav[role];
  if (!targetId || targetId === currentComic.id) {
    showMessage(`No ${role} ${browseMode} comic available.`, 'info');
    return;
  }

  window.location.assign(getComicUrl(targetId));
}

function openExplainShortcut() {
  window.open(getExplainXkcdUrl(currentComic.id), '_blank', 'noopener,noreferrer');
}

async function handleKeyboardShortcut(event) {
  if (!snapshot?.settings.keyboardShortcuts.enabled || !currentComic) {
    return;
  }
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || isEditableShortcutTarget(event.target)) {
    return;
  }

  const key = event.key.toLowerCase();
  const shortcut = Object.entries(KEYBOARD_SHORTCUTS).find(([, descriptor]) => descriptor.key === key)?.[0];
  if (!shortcut) {
    return;
  }

  event.preventDefault();
  try {
    if (shortcut === 'TOGGLE_READ') {
      await toggleCurrentRead();
    } else if (shortcut === 'TOGGLE_FAVORITE') {
      await toggleCurrentFavorite();
    } else if (shortcut === 'SET_CONTINUE') {
      await setCurrentContinuePoint();
    } else if (shortcut === 'PREVIOUS') {
      navigateShortcut('previous');
    } else if (shortcut === 'NEXT') {
      navigateShortcut('next');
    } else if (shortcut === 'EXPLAIN') {
      openExplainShortcut();
    }
  } catch (error) {
    showMessage(error instanceof Error ? error.message : String(error), 'error');
    logNonFatal(error);
  }
}

function addKeyboardHandlers() {
  document.addEventListener('keydown', (event) => {
    handleKeyboardShortcut(event).catch(logNonFatal);
  });
}

function renderModeControls() {
  const group = element('div', { className: 'xrt-button-row xrt-mode-row', attrs: { role: 'group', 'aria-label': 'Browse mode' } });
  const modes = [
    [BROWSE_MODES.ALL, 'All'],
    [BROWSE_MODES.UNREAD, 'Unread'],
    [BROWSE_MODES.FAVORITES, 'Favorites'],
  ];

  for (const [mode, label] of modes) {
    group.append(button(label, () => setBrowseMode(/** @type {import('../shared/types.js').BrowseMode} */ (mode)), {
      pressed: browseMode === mode,
      title: `Browse ${label.toLowerCase()} comics`,
    }));
  }

  return group;
}

function renderStateControls() {
  const state = getComicState(snapshot.comics, currentComic.id);
  const row = element('div', { className: 'xrt-button-row xrt-state-row' });
  const isContinuePoint = snapshot.meta.continuePoint === currentComic.id;
  const canSetContinuePoint = !state.read && !isContinuePoint;
  row.append(
    button('Read', toggleCurrentRead, {
      className: 'xrt-state-button xrt-read-button',
      pressed: state.read,
      title: state.read ? 'Mark this comic unread' : 'Mark this comic read',
    }),
    button('Fav', toggleCurrentFavorite, {
      className: 'xrt-state-button xrt-fav-button',
      pressed: state.favorite,
      title: state.favorite ? 'Remove this comic from favorites' : 'Add this comic to favorites',
    }),
    button('Continue', setCurrentContinuePoint, {
      disabled: !canSetContinuePoint,
      pressed: isContinuePoint,
      title: isContinuePoint
        ? 'This comic is already the continue point'
        : state.read
          ? 'Read comics cannot be set as the continue point'
          : 'Use this unread comic as the backlog continue point',
    })
  );

  const ratingControl = renderRatingControl(state);
  if (ratingControl) {
    row.append(ratingControl);
  }

  return row;
}

/**
 * @param {import('../shared/types.js').ComicState} state
 * @returns {HTMLElement | null}
 */
function renderRatingControl(state) {
  if (snapshot.settings.ratingDisplay !== RATING_DISPLAY_MODES.HIDDEN) {
    const wrapper = element('div', {
      className: `xrt-rating-control xrt-rating-${snapshot.settings.ratingDisplay}`,
      attrs: { role: 'group', 'aria-label': 'Comic rating' },
    });
    const label = element('span', { className: 'xrt-rating-title', text: 'Rating' });
    wrapper.append(label);

    const buttons = getRatingButtons(snapshot.settings.ratingDisplay, state.rating);
    if (snapshot.settings.ratingDisplay === RATING_DISPLAY_MODES.FIVE_STAR) {
      for (const descriptor of buttons) {
        wrapper.append(button(descriptor.text, () => setCurrentRating(descriptor.rating), {
          className: descriptor.className,
          pressed: descriptor.pressed,
          title: descriptor.title,
        }));
      }
    } else {
      const valueLabel = element('span', { className: 'xrt-rating-value', text: formatPreviewRatingValue(state.rating, null) });
      const setPreview = (rating) => {
        valueLabel.textContent = formatPreviewRatingValue(state.rating, rating);
      };
      for (const descriptor of buttons) {
        const dot = button(descriptor.text, () => setCurrentRating(descriptor.rating), {
          className: descriptor.className,
          pressed: descriptor.pressed,
          title: descriptor.title,
        });
        dot.addEventListener('mouseenter', () => setPreview(descriptor.rating));
        dot.addEventListener('focus', () => setPreview(descriptor.rating));
        dot.addEventListener('mouseleave', () => setPreview(null));
        dot.addEventListener('blur', () => setPreview(null));
        wrapper.append(dot);
      }
      wrapper.append(valueLabel);
    }

    wrapper.append(button('Clear', async () => {
      if (state.rating) {
        await setCurrentRating(null);
      }
    }, {
      className: 'xrt-rating-clear',
      disabled: !state.rating,
      title: state.rating ? 'Clear this comic rating' : 'No rating to clear',
    }));

    return wrapper;
  }

  return null;
}

function renderProgress() {
  if (snapshot.settings.progressDisplay === PROGRESS_DISPLAY_MODES.HIDDEN) {
    return document.createDocumentFragment();
  }

  const progress = calculateProgress(snapshot.comics, snapshot.meta.latestKnownComicId);
  const wrapper = element('div', { className: 'xrt-progress' });
  wrapper.append(element('span', { text: formatCompactProgressSummary(progress) }));

  if (snapshot.settings.progressDisplay === PROGRESS_DISPLAY_MODES.BAR) {
    const bar = /** @type {HTMLProgressElement} */ (element('progress', {
      attrs: {
        max: '100',
        value: String(progress.percent),
        'aria-label': 'Reading progress',
      },
    }));
    wrapper.append(bar);
  }

  return wrapper;
}

function renderAltText() {
  const settings = snapshot.settings.altText;
  if (!currentComic.alt || settings.mode === ALT_TEXT_MODES.NATIVE || settings.mode === ALT_TEXT_MODES.HIDDEN) {
    return document.createDocumentFragment();
  }

  const shouldAnimate = altRevealAnimationPending;
  altRevealAnimationPending = false;
  const wrapper = element('div', {
    className: shouldAnimate ? 'xrt-alt-text xrt-alt-text-reveal' : 'xrt-alt-text',
  });
  const label = element('strong', { text: 'Alt text: ' });
  const text = element('span', { text: currentComic.alt });
  wrapper.append(label, text);

  return wrapper;
}

function renderComicContext() {
  const wrapper = element('div', { className: 'xrt-comic-context' });
  const settings = snapshot.settings.altText;
  const shouldShowAlt = currentComic.alt
    && settings.mode !== ALT_TEXT_MODES.NATIVE
    && settings.mode !== ALT_TEXT_MODES.HIDDEN
    && (settings.mode !== ALT_TEXT_MODES.DELAYED || altRevealed);

  if (shouldShowAlt) {
    wrapper.append(renderAltText());
  }

  if (snapshot.settings.navigation.showExplainLink) {
    const labels = snapshot.settings.navigation.useXkcdStyleLabels ? LABELS.themed : LABELS.generic;
    wrapper.append(element('a', {
      className: 'xrt-site-link',
      text: labels.explain,
      attrs: {
        href: getExplainXkcdUrl(currentComic.id),
        target: '_blank',
        rel: 'noreferrer',
        title: 'Open this comic on Explain xkcd',
      },
    }));
  }

  return wrapper.childNodes.length > 0 ? wrapper : document.createDocumentFragment();
}

function renderContinuePoint() {
  const continuePoint = snapshot.meta.continuePoint;
  const wrapper = element('p', { className: 'xrt-continue' });
  if (continuePoint) {
    const link = element('a', {
      className: 'xrt-site-link',
      text: `Continue at #${continuePoint}`,
      attrs: {
        href: getComicUrl(continuePoint),
        title: `Open comic #${continuePoint}`,
      },
    });
    wrapper.append(link);
  } else {
    wrapper.textContent = 'Continue point: caught up or not set.';
  }
  return wrapper;
}

function renderHeader() {
  const state = getComicState(snapshot.comics, currentComic.id);
  const status = [
    state.read ? 'Read' : 'Unread',
    state.favorite ? 'Favorite' : null,
    state.rating ? `Rating ${state.rating}/10` : null,
  ].filter(Boolean).join(' · ');

  const header = element('div', { className: 'xrt-header' });
  header.append(
    element('h3', { text: 'Reading tracker' }),
    element('p', { text: `#${currentComic.id}: ${status || 'No state yet'}` })
  );
  return header;
}

/**
 * @param {string} selector
 * @param {Node} replacement
 */
function replacePanelPart(selector, replacement) {
  const current = panel?.querySelector(selector);
  if (!current) {
    return;
  }
  if (replacement instanceof DocumentFragment && replacement.childNodes.length === 0) {
    current.remove();
    return;
  }
  current.replaceWith(replacement);
}

/**
 * @param {{ progress?: boolean, continuePoint?: boolean, navigation?: boolean }} [options]
 */
function renderCurrentComicState(options = {}) {
  if (!panel || !snapshot || !currentComic) {
    return;
  }

  replacePanelPart('.xrt-header', renderHeader());
  replacePanelPart('.xrt-state-row', renderStateControls());
  if (options.progress) {
    replacePanelPart('.xrt-progress', renderProgress());
  }
  if (options.continuePoint) {
    replacePanelPart('.xrt-continue', renderContinuePoint());
  }
  if (options.navigation) {
    renderNavigation();
    renderBrowseModeNotice();
  }
}

function refreshComicContext() {
  if (!panel) {
    return;
  }

  const current = panel.querySelector('.xrt-comic-context');
  const replacement = renderComicContext();
  if (replacement instanceof DocumentFragment && replacement.childNodes.length === 0) {
    current?.remove();
  } else if (current) {
    current.replaceWith(replacement);
  } else {
    panel.prepend(replacement);
  }
}

function renderLinks() {
  const href = getDashboardUrl();
  const row = element('div', { className: 'xrt-link-row' });
  const link = element('a', {
    className: 'xrt-site-link xrt-dashboard-link',
    text: 'Dashboard',
    attrs: {
      href: href || '#',
      title: 'Open the full xkcd Reading Tracker dashboard',
    },
  });

  const openDashboard = async (event) => {
    event.preventDefault();
    const response = await sendRuntimeMessage({ type: 'xrt:open-dashboard' });
    if (response?.ok !== true && href) {
      window.open(href, '_blank', 'noopener,noreferrer');
    }
  };
  link.addEventListener('click', openDashboard);
  link.addEventListener('auxclick', async (event) => {
    if (event.button === 1) {
      await openDashboard(event);
    }
  });
  row.append(link);
  return row;
}

function getNavigationItems(nav) {
  return [...nav.querySelectorAll('li')].map((item) => {
    const text = item.textContent?.trim() ?? '';
    if (text.includes('|<')) {
      return [item, 'first'];
    }
    if (text.includes('Prev')) {
      return [item, 'previous'];
    }
    if (text.includes('Random')) {
      return [item, 'random'];
    }
    if (text.includes('Next')) {
      return [item, 'next'];
    }
    if (text.includes('>|')) {
      return [item, 'last'];
    }
    return [item, null];
  }).filter(([, role]) => role);
}

function restoreOriginalNavigation() {
  for (const item of document.querySelectorAll('.comicNav .xrt-nav-action')) {
    item.remove();
  }

  for (const item of document.querySelectorAll('.comicNav li[data-xrt-original-html]')) {
    item.innerHTML = item.getAttribute('data-xrt-original-html') ?? item.innerHTML;
  }
}

/**
 * @param {HTMLElement} item
 */
function restoreOriginalNavigationItem(item) {
  if (item.hasAttribute('data-xrt-original-html')) {
    const originalHtml = item.getAttribute('data-xrt-original-html');
    if (originalHtml !== null && item.innerHTML !== originalHtml) {
      item.innerHTML = originalHtml;
    }
  }
}

/**
 * @param {HTMLElement} item
 * @param {{ label: string, title: string }} action
 * @param {number} targetId
 */
function renderEnabledNavigationItem(item, action, targetId) {
  const href = getComicUrl(targetId);
  const title = `${action.title} ${browseMode} comic: #${targetId}`;
  const current = item.children.length === 1 ? item.firstElementChild : null;
  if (
    current?.tagName === 'A'
    && current.textContent === action.label
    && current.getAttribute('href') === href
    && current.getAttribute('title') === title
  ) {
    return;
  }

  item.replaceChildren(element('a', {
    text: action.label,
    attrs: { href, title },
  }));
}

/**
 * @param {HTMLElement} item
 * @param {{ label: string, title: string }} action
 * @param {string} reason
 */
function renderDisabledNavigationItem(item, action, reason) {
  const current = item.children.length === 1 ? item.firstElementChild : null;
  if (
    current?.classList.contains('xrt-disabled-nav')
    && current.textContent === action.label
    && current.getAttribute('title') === reason
  ) {
    return;
  }

  item.replaceChildren(element('span', {
    text: action.label,
    attrs: {
      class: 'xrt-disabled-nav',
      'aria-disabled': 'true',
      title: reason,
    },
  }));
}

/**
 * @param {HTMLElement} navBar
 */
function renderNavActions(navBar) {
  const state = getComicState(snapshot.comics, currentComic.id);
  const labels = snapshot.settings.navigation.useXkcdStyleLabels ? LABELS.themed : LABELS.generic;
  const actionItems = [
    {
      name: 'read',
      text: labels.read,
      title: state.read ? 'Mark this comic unread' : 'Mark this comic read',
      pressed: state.read,
    },
    {
      name: 'favorite',
      text: labels.favorite,
      title: state.favorite ? 'Remove this comic from favorites' : 'Add this comic to favorites',
      pressed: state.favorite,
    },
  ];

  const existingItems = [...navBar.querySelectorAll('.xrt-nav-action')];
  let insertionPoint = getNavigationItems(navBar).find(([, role]) => role === 'previous')?.[0] ?? navBar.lastElementChild;
  for (const [index, action] of actionItems.entries()) {
    let item = existingItems[index];
    if (!item) {
      item = element('li', { className: 'xrt-nav-action' });
      const link = element('a', { className: 'xrt-nav-action-link', attrs: { href: '#' } });
      link.addEventListener('click', async (event) => {
        event.preventDefault();
        try {
          if (link.dataset.xrtAction === 'read') {
            await toggleCurrentRead();
          } else if (link.dataset.xrtAction === 'favorite') {
            await toggleCurrentFavorite();
          }
        } catch (error) {
          showMessage(error instanceof Error ? error.message : String(error), 'error');
          logNonFatal(error);
        }
      });
      item.append(link);
      insertionPoint?.insertAdjacentElement('afterend', item);
    }

    const link = /** @type {HTMLAnchorElement} */ (item.querySelector('.xrt-nav-action-link'));
    link.dataset.xrtAction = action.name;
    link.textContent = action.text;
    link.title = action.title;
    link.setAttribute('aria-pressed', String(action.pressed));
    insertionPoint = item;
  }

  for (const item of existingItems.slice(actionItems.length)) {
    item.remove();
  }
}

function renderNavigation() {
  if (!currentComic || !snapshot) {
    return;
  }

  const nav = calculateNavigation({
    mode: browseMode,
    currentId: currentComic.id,
    state: snapshot.comics,
    latestComicId: snapshot.meta.latestKnownComicId,
  });
  const navBars = [...document.querySelectorAll('.comicNav')];
  const selectedNavBars = snapshot.settings.navigation.updateBothNavBars ? navBars : navBars.slice(0, 1);
  const selectedNavBarSet = new Set(selectedNavBars);

  for (const navBar of navBars) {
    if (!selectedNavBarSet.has(navBar)) {
      for (const item of navBar.querySelectorAll('.xrt-nav-action')) {
        item.remove();
      }
      for (const [item] of getNavigationItems(navBar)) {
        restoreOriginalNavigationItem(item);
      }
      continue;
    }

    for (const [item, role] of getNavigationItems(navBar)) {
      if (!item.hasAttribute('data-xrt-original-html')) {
        item.setAttribute('data-xrt-original-html', item.innerHTML);
      }

      const action = NAV_ACTIONS[role];
      const targetId = nav[role];
      const isDisabled = !targetId || targetId === currentComic.id || (role === 'random' && nav.count <= 1 && nav.includesCurrent);

      if (browseMode === BROWSE_MODES.ALL && role === 'random') {
        restoreOriginalNavigationItem(item);
      } else if (browseMode === BROWSE_MODES.ALL && !isDisabled) {
        restoreOriginalNavigationItem(item);
      } else if (!isDisabled) {
        renderEnabledNavigationItem(item, action, targetId);
      } else {
        renderDisabledNavigationItem(
          item,
          action,
          browseMode === BROWSE_MODES.ALL
            ? `Already at the ${action.title.toLowerCase()} available comic`
            : `No ${action.title.toLowerCase()} ${browseMode} comic available`
        );
      }
    }
    if (snapshot.settings.navigation.showPageNavActions) {
      renderNavActions(navBar);
    } else {
      for (const item of navBar.querySelectorAll('.xrt-nav-action')) {
        item.remove();
      }
    }
  }
}

function scheduleTimers() {
  altTextTimer?.();
  altTextTimer = null;

  const state = getComicState(snapshot.comics, currentComic.id);
  if (!snapshot.settings.autoMarkRead.enabled && autoReadTimer) {
    cancelAutoReadTimer();
  }
  if (!autoReadTimerArmed && snapshot.settings.autoMarkRead.enabled && !state.read) {
    autoReadTimerArmed = true;
    autoReadTimer = startActiveTimer(snapshot.settings.autoMarkRead.delaySeconds, async () => {
      autoReadTimer = null;
      await applyCurrentComicPatch(
        { read: true },
        { progress: true, continuePoint: true, navigation: true },
        { cancelTimer: false }
      );
    });
  }

  if (snapshot.settings.altText.mode === ALT_TEXT_MODES.DELAYED && !altRevealed) {
    altTextTimer = startActiveTimer(snapshot.settings.altText.delaySeconds, () => {
      altRevealed = true;
      altRevealAnimationPending = true;
      refreshComicContext();
    });
  }
}

function renderBrowseModeNotice() {
  panel?.querySelector('.xrt-message')?.remove();
  if (browseMode === BROWSE_MODES.ALL) {
    return;
  }

  const nav = calculateNavigation({
    mode: browseMode,
    currentId: currentComic.id,
    state: snapshot.comics,
    latestComicId: snapshot.meta.latestKnownComicId,
  });
  if (nav.count === 0) {
    showMessage(`No ${browseMode} comics are available.`, 'info');
  } else if (!nav.includesCurrent) {
    showMessage(`This comic is not in the ${browseMode} set. Navigation uses the nearest matching comic numbers.`, 'info');
  }
}

function render() {
  if (!panel || !currentComic || !snapshot) {
    return;
  }

  syncPageStyleVariables();
  if (!isValidComicId(currentComic.id, snapshot.meta.latestKnownComicId)) {
    panel.replaceChildren(
      element('h3', { text: 'Reading tracker' }),
      element('p', { text: `Comic #${currentComic.id} is unavailable or outside the known xkcd range.` })
    );
    return;
  }

  const content = document.createDocumentFragment();
  content.append(
    renderComicContext(),
    renderHeader(),
    renderStateControls(),
    renderModeControls(),
    renderProgress(),
    renderContinuePoint(),
    renderLinks()
  );
  panel.replaceChildren(content);
  renderNavigation();
  scheduleTimers();
  renderBrowseModeNotice();
}

async function refreshFromStorage() {
  snapshot = await storageService.getTrackerSnapshot();
  render();
}

function queueRefreshFromStorage() {
  if (refreshQueued) {
    return;
  }

  refreshQueued = true;
  window.setTimeout(async () => {
    refreshQueued = false;
    try {
      await refreshFromStorage();
    } catch (error) {
      logNonFatal(error);
    }
  }, 50);
}

function addMessageHandlers() {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'xrt:get-current-comic') {
      sendResponse({
        comicId: currentComic?.id ?? null,
        title: currentComic?.title ?? null,
        pageStyle: getPageStyleSnapshot(),
      });
      return false;
    }
    return false;
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && Object.keys(changes).some((key) => key.startsWith('xrt:'))) {
      if (localSyncWriteDepth > 0) {
        return;
      }
      queueRefreshFromStorage();
    }
  });
}

export async function initXkcdTracker() {
  if (document.getElementById(PANEL_ID)) {
    return;
  }

  currentComic = await readCurrentComic();
  if (!currentComic) {
    return;
  }
  getDashboardUrl();
  altRevealed = false;
  altRevealAnimationPending = false;
  autoReadTimerArmed = false;
  autoReadTimer?.();
  autoReadTimer = null;

  ensurePanel();
  panel.append(element('p', { text: 'Loading reading tracker...' }));
  await storageService.ensureStorageReady();
  await ensureLatestKnown(currentComic.id);
  await loadBrowseMode();
  addMessageHandlers();
  addKeyboardHandlers();

  if (snapshot?.meta.lastNewComicId && currentComic.id >= snapshot.meta.lastNewComicId) {
    await runLocalSyncWrite(async () => {
      await storageService.acknowledgeLatestComic(currentComic.id);
      snapshot = await storageService.getTrackerSnapshot();
    });
  }

  render();
  await reportComicPageDetected();
}
