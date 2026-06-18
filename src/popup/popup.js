import { RATING_DISPLAY_MODES } from '../shared/constants.js';
import { calculateProgress, getComicState, isValidComicId } from '../shared/comic-state.js';
import { getComicUrl } from '../shared/navigation.js';
import { createOnboardingPlan, ONBOARDING_MODES, shouldSuggestOnboarding } from '../shared/onboarding.js';
import { formatProgressSummary } from '../shared/progress-format.js';
import { formatPreviewRatingValue, getRatingButtons } from '../shared/rating-control.js';
import { storageService } from '../storage/storage-service.js';
import { metadataCache } from '../storage/metadata-cache.js';

const app = document.getElementById('app');
let snapshot = null;
let activeComic = null;
let popupMetadataById = {};
const POPUP_STYLE_PROPERTIES = Object.freeze([
  '--xrt-page-bg',
  '--xrt-bg',
  '--xrt-text',
  '--xrt-border',
  '--xrt-soft-border',
  '--xrt-link',
  '--xrt-link-font-weight',
  '--xrt-link-text-decoration',
  '--xrt-nav-bg',
  '--xrt-nav-color',
  '--xrt-nav-border',
  '--xrt-nav-radius',
  '--xrt-nav-font-weight',
  '--xrt-nav-padding',
  '--xrt-nav-margin',
  '--xrt-nav-shadow',
  '--xrt-nav-font-size',
  '--xrt-nav-hover-bg',
  '--xrt-nav-hover-color',
]);

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
 * @param {{ className?: string, pressed?: boolean, disabled?: boolean, title?: string }} [options]
 * @returns {HTMLButtonElement}
 */
function button(text, onClick, options = {}) {
  const node = /** @type {HTMLButtonElement} */ (element('button', {
    className: options.className,
    text,
    attrs: { type: 'button', title: options.title ?? text },
  }));
  if (options.pressed != null) {
    node.setAttribute('aria-pressed', String(options.pressed));
  }
  node.disabled = Boolean(options.disabled);
  node.addEventListener('click', async () => {
    try {
      await onClick();
    } catch (error) {
      showMessage(error instanceof Error ? error.message : String(error), true);
    }
  });
  return node;
}

/**
 * @param {import('../shared/types.js').AppearanceTheme | undefined} theme
 */
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme ?? 'system';
}

/**
 * @param {Record<string, string> | null | undefined} style
 */
function applyPageStyle(style) {
  for (const property of POPUP_STYLE_PROPERTIES) {
    document.documentElement.style.removeProperty(property);
  }

  if (!style || typeof style !== 'object') {
    return;
  }

  for (const property of POPUP_STYLE_PROPERTIES) {
    const value = style[property];
    if (typeof value === 'string' && value.trim()) {
      document.documentElement.style.setProperty(property, value);
    }
  }
}

/**
 * @param {string} text
 * @param {boolean} [isError]
 */
function showMessage(text, isError = false) {
  const old = app.querySelector('.message');
  old?.remove();
  app.append(element('p', { className: `message${isError ? ' error' : ''}`, text }));
}

/**
 * @param {string} url
 * @returns {Promise<void>}
 */
async function openTab(url) {
  await chrome.tabs.create({ url });
}

/**
 * @param {number[]} comicIds
 * @returns {Promise<Record<string, import('../shared/types.js').ComicMetadata>>}
 */
async function getPopupMetadata(comicIds) {
  const ids = [...new Set(comicIds)].filter((id) => Number.isInteger(id));
  if (ids.length === 0) {
    return {};
  }

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'xrt:get-comic-metadata',
      comicIds: ids,
      limit: 6,
    });
    if (response?.ok && response.metadataById && typeof response.metadataById === 'object') {
      return response.metadataById;
    }
  } catch {
    // Fall back to local cache below. Metadata is nice-to-have in the popup.
  }

  return metadataCache.getCachedMetadataForComics(ids);
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
    return Number(match[1]);
  } catch {
    return null;
  }
}

/**
 * @returns {Promise<{ id: number, title: string | null, pageStyle: Record<string, string> | null } | null>}
 */
async function getActiveComic() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    return null;
  }

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'xrt:get-current-comic' });
    if (response?.comicId) {
      return {
        id: response.comicId,
        title: response.title ?? null,
        pageStyle: response.pageStyle && typeof response.pageStyle === 'object' ? response.pageStyle : null,
      };
    }
  } catch {
    // The active tab may not have the content script. Falling back to URL is enough for numbered pages.
  }

  const id = tab.url ? getComicIdFromUrl(tab.url) : null;
  return id ? { id, title: null, pageStyle: null } : null;
}

/**
 * @param {number | null | undefined} comicId
 * @returns {string | null}
 */
function getCachedComicTitle(comicId) {
  if (!comicId) {
    return null;
  }

  const metadata = popupMetadataById[String(comicId)];
  return metadata?.safeTitle ?? metadata?.title ?? null;
}

/**
 * @param {number} comicId
 * @param {string | null | undefined} title
 * @returns {string}
 */
function formatComicLabel(comicId, title) {
  return `#${comicId}${title ? `: ${title}` : ''}`;
}

/**
 * @param {number} comicId
 * @param {string | null | undefined} title
 * @returns {HTMLAnchorElement}
 */
function comicLink(comicId, title) {
  return /** @type {HTMLAnchorElement} */ (element('a', {
    text: formatComicLabel(comicId, title),
    attrs: {
      href: getComicUrl(comicId),
      target: '_blank',
      rel: 'noreferrer',
      title: title ? `Open xkcd #${comicId}: ${title}` : `Open xkcd comic #${comicId}`,
    },
  }));
}

function renderProgressSection() {
  const progress = calculateProgress(snapshot.comics, snapshot.meta.latestKnownComicId);
  const section = element('section', { children: [element('h1', { text: 'xkcd Tracker' })] });
  section.append(element('p', {
    text: formatProgressSummary(progress),
  }));
  const bar = /** @type {HTMLProgressElement} */ (element('progress', {
    attrs: { max: '100', value: String(progress.percent), 'aria-label': 'Reading progress' },
  }));
  section.append(bar);
  return section;
}

function renderOnboardingNudge() {
  const section = element('section', { className: 'section onboarding-nudge', children: [element('h2', { text: 'Setup' })] });
  section.append(element('p', { text: 'Choose where tracking starts so progress and continue links make sense.' }));

  const actions = [
    button('Open setup', () => openTab(chrome.runtime.getURL('src/dashboard/dashboard.html#onboarding')), {
      title: 'Open the full setup flow in the dashboard',
    }),
  ];

  if (snapshot.meta.latestKnownComicId) {
    actions.push(
      button('Start #1', () => applyOnboarding(ONBOARDING_MODES.BEGINNING), {
        title: 'Set the continue point to the first available comic',
      })
    );

    if (activeComic && isValidComicId(activeComic.id, snapshot.meta.latestKnownComicId)) {
      actions.push(button('Use current', () => applyOnboarding(ONBOARDING_MODES.CURRENT, activeComic.id), {
        title: `Mark previous comics read and continue at #${activeComic.id}`,
      }));
    }

    actions.push(button('Caught up', () => applyOnboarding(ONBOARDING_MODES.CAUGHT_UP), {
      title: 'Mark every known xkcd comic read',
    }));
  } else {
    actions.push(button('Check now', async () => {
      await chrome.runtime.sendMessage({ type: 'xrt:check-latest-comic' });
      await refresh();
    }, { title: 'Check xkcd for the latest comic number' }));
  }

  actions.push(button('Skip', skipOnboarding, {
    title: 'Hide setup without changing read state',
  }));

  section.append(element('div', { className: 'row', children: actions }));
  return section;
}

/**
 * @param {string} mode
 * @param {number | null} [targetComicId]
 */
async function applyOnboarding(mode, targetComicId = null) {
  const result = createOnboardingPlan({
    mode,
    targetComicId,
    latestComicId: snapshot.meta.latestKnownComicId,
  });
  if (!result.ok) {
    showMessage(result.error, true);
    return;
  }

  if (!window.confirm(result.plan.confirmText)) {
    return;
  }

  snapshot = await storageService.applyOnboardingPlan(result.plan);
  await chrome.runtime.sendMessage({ type: 'xrt:update-badge' });
  await refresh();
  showMessage(result.plan.summary);
}

async function skipOnboarding() {
  snapshot = await storageService.completeOnboarding();
  await refresh();
  showMessage('Setup skipped.');
}

function renderContinueSection() {
  const section = element('section', { className: 'section', children: [element('h2', { text: 'Continue' })] });
  if (!snapshot.meta.continuePoint) {
    section.append(element('p', { className: 'muted', text: 'No continue point is set, or everything after it is read.' }));
    return section;
  }

  section.append(element('p', {
    children: [
      document.createTextNode('Next backlog comic: '),
      comicLink(snapshot.meta.continuePoint, getCachedComicTitle(snapshot.meta.continuePoint)),
    ],
  }));
  return section;
}

function renderNewComicSection() {
  const section = element('section', { className: 'section', children: [element('h2', { text: 'New Comic' })] });
  const lastNew = snapshot.meta.lastNewComicId;
  const acknowledged = snapshot.meta.acknowledgedLatestComicId ?? 0;
  const latestKnown = snapshot.meta.latestKnownComicId;

  if (!lastNew || lastNew <= acknowledged) {
    section.append(element('p', { className: 'muted', text: 'No newly published comic is waiting.' }));
  } else {
    section.append(element('p', {
      children: [
        document.createTextNode('New: '),
        comicLink(lastNew, getCachedComicTitle(lastNew)),
      ],
    }));
    section.append(element('div', {
      className: 'row',
      children: [
        button('Acknowledge', async () => {
          await storageService.acknowledgeLatestComic(lastNew);
          await chrome.runtime.sendMessage({ type: 'xrt:update-badge' });
          await refresh();
        }, { title: 'Clear the new-comic badge without marking the comic read' }),
      ],
    }));
  }

  if (latestKnown) {
    section.append(element('p', {
      className: 'latest-comic-link',
      children: [
        document.createTextNode('Latest known comic: '),
        comicLink(latestKnown, getCachedComicTitle(latestKnown)),
      ],
    }));
  }

  return section;
}

function renderActiveComicSection() {
  const section = element('section', { className: 'section', children: [element('h2', { text: 'Current Tab' })] });
  if (!activeComic || !isValidComicId(activeComic.id, snapshot.meta.latestKnownComicId)) {
    section.append(element('p', { className: 'muted', text: 'No xkcd comic detected in the active tab.' }));
    return section;
  }

  const state = getComicState(snapshot.comics, activeComic.id);
  const isContinuePoint = snapshot.meta.continuePoint === activeComic.id;
  const canSetContinuePoint = !state.read && !isContinuePoint;
  section.append(element('p', {
    children: [comicLink(activeComic.id, activeComic.title ?? getCachedComicTitle(activeComic.id))],
  }));
  const row = element('div', { className: 'row' });
  row.append(
    button('Read', async () => {
      snapshot = await storageService.updateComicState(activeComic.id, { read: !state.read });
      await chrome.runtime.sendMessage({ type: 'xrt:update-badge' });
      await refresh();
    }, { pressed: state.read, title: state.read ? 'Mark the active comic unread' : 'Mark the active comic read' }),
    button('Fav', async () => {
      snapshot = await storageService.updateComicState(activeComic.id, { favorite: !state.favorite });
      await refresh();
    }, { pressed: state.favorite, title: state.favorite ? 'Remove the active comic from favorites' : 'Add the active comic to favorites' }),
    button('Continue', async () => {
      await storageService.setContinuePoint(activeComic.id);
      await refresh();
    }, {
      disabled: !canSetContinuePoint,
      pressed: isContinuePoint,
      title: isContinuePoint
        ? 'The active comic is already the continue point'
        : state.read
          ? 'Read comics cannot be set as the continue point'
          : 'Set the active unread comic as the continue point',
    })
  );
  section.append(row);

  if (snapshot.settings.ratingDisplay !== RATING_DISPLAY_MODES.HIDDEN) {
    section.append(renderRatingControl(activeComic.id, state.rating));
  }

  return section;
}

/**
 * @param {number} comicId
 * @param {number | null} rating
 * @returns {HTMLElement}
 */
function renderRatingControl(comicId, rating) {
  const wrapper = element('div', {
    className: `row xrt-rating-control xrt-rating-${snapshot.settings.ratingDisplay}`,
    attrs: { role: 'group', 'aria-label': 'Current comic rating' },
  });
  wrapper.append(element('span', { className: 'xrt-rating-title', text: 'Rating' }));

  const buttons = getRatingButtons(snapshot.settings.ratingDisplay, rating);
  if (snapshot.settings.ratingDisplay === RATING_DISPLAY_MODES.TEN_POINT) {
    const valueLabel = element('span', { className: 'xrt-rating-value', text: formatPreviewRatingValue(rating, null) });
    const setPreview = (previewRating) => {
      valueLabel.textContent = formatPreviewRatingValue(rating, previewRating);
    };
    for (const descriptor of buttons) {
      const dot = button(descriptor.text, async () => {
        await storageService.updateComicState(comicId, { rating: descriptor.rating });
        await refresh();
      }, {
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
  } else {
    for (const descriptor of buttons) {
      wrapper.append(button(descriptor.text, async () => {
        await storageService.updateComicState(comicId, { rating: descriptor.rating });
        await refresh();
      }, {
        className: descriptor.className,
        pressed: descriptor.pressed,
        title: descriptor.title,
      }));
    }
  }

  wrapper.append(button('Clear', async () => {
    if (rating) {
      await storageService.updateComicState(comicId, { rating: null });
      await refresh();
    }
  }, {
    className: 'xrt-rating-clear',
    disabled: !rating,
    title: rating ? 'Clear the active comic rating' : 'No rating to clear',
  }));

  return wrapper;
}

function renderLinks() {
  const section = element('section', { className: 'section' });
  section.append(element('div', {
    className: 'row',
    children: [
      button('Dashboard', () => openTab(chrome.runtime.getURL('src/dashboard/dashboard.html')), {
        title: 'Open the full xkcd Reading Tracker dashboard',
      }),
      button('Favorites', () => openTab(chrome.runtime.getURL('src/dashboard/dashboard.html#favorites')), {
        title: 'Open the favorites section in the dashboard',
      }),
      button('Settings', () => openTab(chrome.runtime.getURL('src/dashboard/dashboard.html#settings')), {
        title: 'Open tracker settings',
      }),
      button('Check now', async () => {
        await chrome.runtime.sendMessage({ type: 'xrt:check-latest-comic' });
        await refresh();
      }, { title: 'Check xkcd for a newly published comic now' }),
    ],
  }));
  return section;
}

function render() {
  const sections = [
    renderProgressSection(),
    ...(shouldSuggestOnboarding(snapshot.meta) ? [renderOnboardingNudge()] : []),
    renderContinueSection(),
    renderNewComicSection(),
    renderActiveComicSection(),
    renderLinks(),
  ];
  app.replaceChildren(...sections);
}

async function refresh() {
  snapshot = await storageService.getTrackerSnapshot();
  applyTheme(snapshot.settings.appearance.theme);
  activeComic = await getActiveComic();
  applyPageStyle(activeComic?.pageStyle);
  const metadataIds = [
    snapshot.meta.continuePoint,
    snapshot.meta.latestKnownComicId,
    snapshot.meta.lastNewComicId,
    activeComic?.id,
  ].filter((id) => Number.isInteger(id));
  popupMetadataById = await getPopupMetadata(/** @type {number[]} */ (metadataIds));
  render();
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && Object.keys(changes).some((key) => key.startsWith('xrt:'))) {
    refresh().catch((error) => showMessage(String(error), true));
  }
});

refresh().catch((error) => {
  app.replaceChildren(element('p', { className: 'message error', text: String(error) }));
});
