import { RATING_DISPLAY_MODES } from '../shared/constants.js';
import { calculateProgress, getComicState, getUnreadComicIds, isValidComicId } from '../shared/comic-state.js';
import { getComicUrl } from '../shared/navigation.js';
import { formatProgressSummary } from '../shared/progress-format.js';
import { formatPreviewRatingValue, getRatingButtons } from '../shared/rating-control.js';
import { getUnreadRangesFromIds, parseComicRangeInput } from '../shared/ranges.js';
import { storageService } from '../storage/storage-service.js';

const app = document.getElementById('app');
let snapshot = null;
let activeComic = null;

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
 * @returns {Promise<{ id: number, title: string | null } | null>}
 */
async function getActiveComic() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    return null;
  }

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'xrt:get-current-comic' });
    if (response?.comicId) {
      return { id: response.comicId, title: response.title ?? null };
    }
  } catch {
    // The active tab may not have the content script. Falling back to URL is enough for numbered pages.
  }

  const id = tab.url ? getComicIdFromUrl(tab.url) : null;
  return id ? { id, title: null } : null;
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

function renderContinueSection() {
  const section = element('section', { className: 'section', children: [element('h2', { text: 'Continue' })] });
  if (!snapshot.meta.continuePoint) {
    section.append(element('p', { className: 'muted', text: 'No continue point is set, or everything after it is read.' }));
    return section;
  }

  section.append(element('p', { text: `Next backlog comic: #${snapshot.meta.continuePoint}` }));
  section.append(element('div', {
    className: 'row',
    children: [button('Open', () => openTab(getComicUrl(snapshot.meta.continuePoint)), {
      title: `Open continue point #${snapshot.meta.continuePoint}`,
    })],
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
    section.append(element('p', { text: `xkcd #${lastNew} is new.` }));
    section.append(element('div', {
      className: 'row',
      children: [
        button('Open', () => openTab(getComicUrl(lastNew)), {
          title: `Open new xkcd comic #${lastNew}`,
        }),
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
        element('a', {
          text: `#${latestKnown}`,
          attrs: {
            href: getComicUrl(latestKnown),
            target: '_blank',
            rel: 'noreferrer',
            title: `Open latest known xkcd comic #${latestKnown}`,
          },
        }),
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
  section.append(element('p', { text: `#${activeComic.id}${activeComic.title ? `: ${activeComic.title}` : ''}` }));
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

function renderUnreadPreview() {
  const section = element('section', { className: 'section', children: [element('h2', { text: 'Unread' })] });
  const ranges = getUnreadRangesFromIds(getUnreadComicIds(snapshot.comics, snapshot.meta.latestKnownComicId));
  if (ranges.length === 0) {
    section.append(element('p', { className: 'muted', text: 'No unread comics in the known range.' }));
    return section;
  }

  const rangeList = element('div', { className: 'range-list' });
  for (const range of ranges.slice(0, 4)) {
    const item = element('span', { className: 'range-item' });
    item.append(
      element('a', {
        text: String(range.start),
        attrs: {
          href: getComicUrl(range.start),
          target: '_blank',
          rel: 'noreferrer',
          title: `Open unread range start #${range.start}`,
        },
      })
    );
    if (range.start !== range.end) {
      item.append(
        document.createTextNode('-'),
        element('a', {
          text: String(range.end),
          attrs: {
            href: getComicUrl(range.end),
            target: '_blank',
            rel: 'noreferrer',
            title: `Open unread range end #${range.end}`,
          },
        })
      );
    }
    item.append(element('span', { className: 'muted', text: `(${range.end - range.start + 1})` }));
    rangeList.append(item);
  }
  if (ranges.length > 4) {
    rangeList.append(element('span', { className: 'muted', text: '...' }));
  }
  section.append(rangeList);
  const input = /** @type {HTMLInputElement} */ (element('input', {
    attrs: {
      type: 'text',
      placeholder: '1-10, 42, 100..120',
      'aria-label': 'Comic numbers or ranges',
    },
  }));
  section.append(element('div', {
    className: 'row',
    children: [
      input,
      button('Mark read', async () => applyBulk(input.value, true), {
        title: 'Mark the entered comic numbers or ranges as read',
      }),
      button('Mark unread', async () => applyBulk(input.value, false), {
        title: 'Mark the entered comic numbers or ranges as unread',
      }),
    ],
  }));
  return section;
}

/**
 * @param {string} input
 * @param {boolean} read
 */
async function applyBulk(input, read) {
  const parsed = parseComicRangeInput(input, { latestComicId: snapshot.meta.latestKnownComicId });
  if (parsed.errors.length > 0 && parsed.ids.length === 0) {
    showMessage(parsed.errors[0], true);
    return;
  }

  await storageService.updateManyComicStates(parsed.ids, { read });
  await refresh();
  showMessage(`${read ? 'Marked read' : 'Marked unread'}: ${parsed.ids.length} comic${parsed.ids.length === 1 ? '' : 's'}.`);
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
  app.replaceChildren(
    renderProgressSection(),
    renderContinueSection(),
    renderNewComicSection(),
    renderActiveComicSection(),
    renderUnreadPreview(),
    renderLinks()
  );
}

async function refresh() {
  snapshot = await storageService.getTrackerSnapshot();
  applyTheme(snapshot.settings.appearance.theme);
  activeComic = await getActiveComic();
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
