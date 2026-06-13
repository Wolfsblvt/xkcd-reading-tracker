import { ALT_TEXT_MODES, BROWSE_MODES, PROGRESS_DISPLAY_MODES, RATING_DISPLAY_MODES } from '../shared/constants.js';
import { calculateNavigation, getComicUrl, getExplainXkcdUrl } from '../shared/navigation.js';
import { calculateProgress, getComicState, isValidComicId } from '../shared/comic-state.js';
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

/**
 * @param {unknown} error
 */
function logNonFatal(error) {
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
    await storageService.updateMeta({
      latestKnownComicId: latest.num,
      latestCheckedAt: new Date().toISOString(),
    });
  } catch (error) {
    logNonFatal(error);
    await storageService.updateMeta({
      latestKnownComicId: currentId,
      latestCheckedAt: new Date().toISOString(),
    });
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
      await callback();
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

  const navLink = document.querySelector('.comicNav a');
  if (!navLink) {
    return;
  }

  const style = getComputedStyle(navLink);
  for (const target of [panel, document.documentElement]) {
    target.style.setProperty('--xrt-nav-bg', style.backgroundColor);
    target.style.setProperty('--xrt-nav-color', style.color);
    target.style.setProperty('--xrt-nav-border', style.borderColor);
    target.style.setProperty('--xrt-nav-radius', style.borderRadius);
    target.style.setProperty('--xrt-nav-font-weight', style.fontWeight);
    target.style.setProperty('--xrt-nav-padding', style.padding);
    target.style.setProperty('--xrt-nav-margin', style.margin);
    target.style.setProperty('--xrt-nav-hover-bg', style.color);
    target.style.setProperty('--xrt-nav-hover-color', style.backgroundColor);
  }
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
  render();
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
  row.append(
    button('Read', async () => {
      cancelAutoReadTimer();
      snapshot = await storageService.updateComicState(currentComic.id, { read: !state.read });
      if (!state.read) {
        await sendRuntimeMessage({ type: 'xrt:update-badge' });
      }
      render();
    }, {
      className: 'xrt-state-button xrt-read-button',
      pressed: state.read,
      title: state.read ? 'Mark this comic unread' : 'Mark this comic read',
    }),
    button('Fav', async () => {
      cancelAutoReadTimer();
      snapshot = await storageService.updateComicState(currentComic.id, { favorite: !state.favorite });
      render();
    }, {
      className: 'xrt-state-button xrt-fav-button',
      pressed: state.favorite,
      title: state.favorite ? 'Remove this comic from favorites' : 'Add this comic to favorites',
    }),
    button('Set continue here', async () => {
      cancelAutoReadTimer();
      await storageService.setContinuePoint(currentComic.id);
      await refreshFromStorage();
      showMessage(`Continue point set to #${currentComic.id}.`);
    }, {
      disabled: isContinuePoint,
      pressed: isContinuePoint,
      title: isContinuePoint ? 'This comic is already the continue point' : 'Use this comic as the backlog continue point',
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

    if (snapshot.settings.ratingDisplay === RATING_DISPLAY_MODES.FIVE_STAR) {
      for (let star = 1; star <= 5; star += 1) {
        const fullValue = star * 2;
        const halfValue = fullValue - 1;
        const starState = state.rating >= fullValue ? 'full' : state.rating === halfValue ? 'half' : 'empty';
        const starText = starState === 'full' ? '★' : starState === 'half' ? '⯨' : '☆';
        wrapper.append(button(starText, async () => {
          cancelAutoReadTimer();
          const nextRating = state.rating === fullValue ? halfValue : fullValue;
          snapshot = await storageService.updateComicState(currentComic.id, { rating: nextRating });
          render();
        }, {
          className: `xrt-rating-button xrt-star-button xrt-star-${starState}`,
          pressed: state.rating >= halfValue,
          title: state.rating === fullValue ? `Set ${star - 0.5} stars` : `Set ${star} stars`,
        }));
      }
    } else {
      const valueLabel = element('span', { className: 'xrt-rating-value', text: state.rating ? `${state.rating}/10` : '0/10' });
      const setPreview = (rating) => {
        valueLabel.textContent = rating ? `${rating}/10` : state.rating ? `${state.rating}/10` : '0/10';
      };
      for (let rating = 1; rating <= 10; rating += 1) {
        const dot = button(state.rating && rating <= state.rating ? '●' : '○', async () => {
          cancelAutoReadTimer();
          snapshot = await storageService.updateComicState(currentComic.id, { rating });
          render();
        }, {
          className: 'xrt-rating-button xrt-dot-button',
          pressed: state.rating === rating,
          title: `Set rating to ${rating}/10`,
        });
        dot.addEventListener('mouseenter', () => setPreview(rating));
        dot.addEventListener('focus', () => setPreview(rating));
        dot.addEventListener('mouseleave', () => setPreview(null));
        dot.addEventListener('blur', () => setPreview(null));
        wrapper.append(dot);
      }
      wrapper.append(valueLabel);
    }

    wrapper.append(button('Clear', async () => {
      if (state.rating) {
        cancelAutoReadTimer();
        snapshot = await storageService.updateComicState(currentComic.id, { rating: null });
        render();
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
  wrapper.append(element('span', { text: `${progress.read} of ${progress.total} comics read (${progress.percent}%).` }));

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
    wrapper.append(element('a', {
      text: 'Huh?',
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
      text: `Continue at #${continuePoint}`,
      attrs: { href: getComicUrl(continuePoint) },
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

function renderLinks() {
  const row = element('div', { className: 'xrt-link-row' });
  row.append(element('a', {
    text: 'Dashboard',
    attrs: {
      href: chrome.runtime.getURL('src/dashboard/dashboard.html'),
      target: '_blank',
      title: 'Open the full xkcd Reading Tracker dashboard',
    },
  }));
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
    item.innerHTML = item.getAttribute('data-xrt-original-html') ?? item.innerHTML;
  }
}

/**
 * @param {HTMLElement} item
 * @param {{ label: string, title: string }} action
 * @param {string} reason
 */
function renderDisabledNavigationItem(item, action, reason) {
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
  for (const item of navBar.querySelectorAll('.xrt-nav-action')) {
    item.remove();
  }

  const state = getComicState(snapshot.comics, currentComic.id);
  const actionItems = [
    {
      text: 'Read',
      title: state.read ? 'Mark this comic unread' : 'Mark this comic read',
      pressed: state.read,
      action: async () => {
        cancelAutoReadTimer();
        snapshot = await storageService.updateComicState(currentComic.id, { read: !state.read });
        if (!state.read) {
          await sendRuntimeMessage({ type: 'xrt:update-badge' });
        }
        render();
      },
    },
    {
      text: 'Fav',
      title: state.favorite ? 'Remove this comic from favorites' : 'Add this comic to favorites',
      pressed: state.favorite,
      action: async () => {
        cancelAutoReadTimer();
        snapshot = await storageService.updateComicState(currentComic.id, { favorite: !state.favorite });
        render();
      },
    },
  ];

  let insertionPoint = getNavigationItems(navBar).find(([, role]) => role === 'previous')?.[0] ?? navBar.lastElementChild;
  for (const action of actionItems) {
    const item = element('li', { className: 'xrt-nav-action' });
    const link = element('a', {
      className: 'xrt-nav-action-link',
      text: action.text,
      attrs: {
        href: '#',
        title: action.title,
        'aria-pressed': String(action.pressed),
      },
    });
    link.addEventListener('click', async (event) => {
      event.preventDefault();
      try {
        await action.action();
      } catch (error) {
        showMessage(error instanceof Error ? error.message : String(error), 'error');
        logNonFatal(error);
      }
    });
    item.append(link);
    insertionPoint?.insertAdjacentElement('afterend', item);
    insertionPoint = item;
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
        item.replaceChildren();
        item.append(element('a', {
          text: action.label,
          attrs: {
            href: getComicUrl(targetId),
            title: `${action.title} ${browseMode} comic: #${targetId}`,
          },
        }));
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
      snapshot = await storageService.updateComicState(currentComic.id, { read: true });
      await sendRuntimeMessage({ type: 'xrt:update-badge' });
      render();
    });
  }

  if (snapshot.settings.altText.mode === ALT_TEXT_MODES.DELAYED && !altRevealed) {
    altTextTimer = startActiveTimer(snapshot.settings.altText.delaySeconds, () => {
      altRevealed = true;
      altRevealAnimationPending = true;
      render();
    });
  }
}

function render() {
  if (!panel || !currentComic || !snapshot) {
    return;
  }

  panel.replaceChildren();
  syncPageStyleVariables();
  if (!isValidComicId(currentComic.id, snapshot.meta.latestKnownComicId)) {
    panel.append(
      element('h3', { text: 'Reading tracker' }),
      element('p', { text: `Comic #${currentComic.id} is unavailable or outside the known xkcd range.` })
    );
    return;
  }

  panel.append(
    renderComicContext(),
    renderHeader(),
    renderStateControls(),
    renderModeControls(),
    renderProgress(),
    renderContinuePoint(),
    renderLinks()
  );
  renderNavigation();
  scheduleTimers();

  if (browseMode !== BROWSE_MODES.ALL) {
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
      });
      return false;
    }
    return false;
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && Object.keys(changes).some((key) => key.startsWith('xrt:'))) {
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

  if (snapshot?.meta.lastNewComicId && currentComic.id >= snapshot.meta.lastNewComicId) {
    await storageService.acknowledgeLatestComic(currentComic.id);
    await sendRuntimeMessage({ type: 'xrt:update-badge' });
    snapshot = await storageService.getTrackerSnapshot();
  }

  render();
}
