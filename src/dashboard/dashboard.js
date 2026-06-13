import { ALT_TEXT_MODES, BROWSE_MODES, PROGRESS_DISPLAY_MODES, RATING_DISPLAY_MODES } from '../shared/constants.js';
import { calculateProgress, getComicState, getFavoriteComicIds, getUnreadComicIds } from '../shared/comic-state.js';
import { getComicUrl, getExplainXkcdUrl } from '../shared/navigation.js';
import { formatRanges, getUnreadRangesFromIds, parseComicRangeInput } from '../shared/ranges.js';
import { storageService } from '../storage/storage-service.js';
import { metadataCache } from '../storage/metadata-cache.js';

const app = document.getElementById('app');
let snapshot = null;
let metadataById = {};
let storageUsage = null;

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
 * @param {{ className?: string }} [options]
 * @returns {HTMLButtonElement}
 */
function button(text, onClick, options = {}) {
  const node = /** @type {HTMLButtonElement} */ (element('button', {
    className: options.className,
    text,
    attrs: { type: 'button' },
  }));
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
 * @param {string} text
 * @param {boolean} [isError]
 */
function showMessage(text, isError = false) {
  const old = app.querySelector('.message');
  old?.remove();
  app.prepend(element('p', { className: `message${isError ? ' error' : ''}`, text }));
}

/**
 * @param {string} name
 * @param {object} value
 */
function downloadJson(name, value) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = element('a', {
    attrs: {
      href: url,
      download: name,
    },
  });
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * @param {string} labelText
 * @param {HTMLElement} control
 * @returns {HTMLElement}
 */
function field(labelText, control) {
  const label = element('label', { className: 'field' });
  label.append(element('span', { text: labelText }), control);
  return label;
}

/**
 * @param {Record<string, string>} options
 * @param {string} selected
 * @returns {HTMLSelectElement}
 */
function selectFromOptions(options, selected) {
  const select = /** @type {HTMLSelectElement} */ (element('select'));
  for (const [value, label] of Object.entries(options)) {
    const option = /** @type {HTMLOptionElement} */ (element('option', { text: label, attrs: { value } }));
    option.selected = value === selected;
    select.append(option);
  }
  return select;
}

function renderOverview() {
  const progress = calculateProgress(snapshot.comics, snapshot.meta.latestKnownComicId);
  const section = element('section', { attrs: { id: 'overview' } });
  section.append(element('h2', { text: 'Overview' }));
  section.append(element('p', { text: `${progress.read} of ${progress.total} known comics read. ${progress.unread} unread.` }));
  section.append(element('progress', { attrs: { max: '100', value: String(progress.percent), 'aria-label': 'Reading progress' } }));

  const row = element('div', { className: 'row' });
  if (snapshot.meta.continuePoint) {
    row.append(
      element('a', {
        text: `Continue at #${snapshot.meta.continuePoint}`,
        attrs: { href: getComicUrl(snapshot.meta.continuePoint) },
      })
    );
  } else {
    row.append(element('span', { className: 'muted', text: 'Continue point is not set or you are caught up.' }));
  }
  row.append(button('Check for new comic', async () => {
    await chrome.runtime.sendMessage({ type: 'xrt:check-latest-comic' });
    await refresh();
    showMessage('Latest-comic check completed.');
  }));
  section.append(row);

  const lastNew = snapshot.meta.lastNewComicId;
  if (lastNew && lastNew > (snapshot.meta.acknowledgedLatestComicId ?? 0)) {
    section.append(element('p', {
      className: 'message',
      text: `New comic #${lastNew} has not been acknowledged yet.`,
    }));
  }

  return section;
}

function renderFavorites() {
  const section = element('section', { attrs: { id: 'favorites' } });
  const favoriteIds = getFavoriteComicIds(snapshot.comics, snapshot.meta.latestKnownComicId);
  section.append(element('h2', { text: 'Favorites' }));
  if (favoriteIds.length === 0) {
    section.append(element('p', { className: 'muted', text: 'No favorite comics yet.' }));
    return section;
  }

  const sorted = favoriteIds.sort((a, b) => {
    const ratingDiff = (getComicState(snapshot.comics, b).rating ?? 0) - (getComicState(snapshot.comics, a).rating ?? 0);
    return ratingDiff || a - b;
  });
  const table = element('table');
  table.append(element('thead', {
    children: [element('tr', {
      children: [
        element('th', { text: 'Comic' }),
        element('th', { text: 'Title' }),
        element('th', { text: 'Rating' }),
        element('th', { text: 'Links' }),
      ],
    })],
  }));
  const body = element('tbody');
  for (const id of sorted) {
    const state = getComicState(snapshot.comics, id);
    const metadata = metadataById[String(id)];
    body.append(element('tr', {
      children: [
        element('td', { text: `#${id}` }),
        element('td', { text: metadata?.title ?? 'Metadata not cached' }),
        element('td', { text: state.rating ? `${state.rating}/10` : '-' }),
        element('td', {
          children: [
            element('a', { text: 'xkcd', attrs: { href: getComicUrl(id) } }),
            document.createTextNode(' · '),
            element('a', { text: 'Explain', attrs: { href: getExplainXkcdUrl(id) } }),
          ],
        }),
      ],
    }));
  }
  table.append(body);
  section.append(table);
  section.append(element('div', {
    className: 'row',
    children: [button('Fetch missing favorite titles', fetchMissingFavoriteTitles)],
  }));
  return section;
}

async function fetchMissingFavoriteTitles() {
  const favoriteIds = getFavoriteComicIds(snapshot.comics, snapshot.meta.latestKnownComicId);
  const missing = favoriteIds.filter((id) => !metadataById[String(id)]);
  for (const id of missing.slice(0, 25)) {
    try {
      const metadata = await metadataCache.getOrFetchComicMetadata(id);
      metadataById[String(id)] = metadata;
    } catch {
      // Missing metadata is nonfatal; the row already has a usable comic number.
    }
  }
  render();
  showMessage(missing.length > 25 ? 'Fetched the first 25 missing favorite titles.' : 'Favorite title cache updated.');
}

function renderUnread() {
  const section = element('section', { attrs: { id: 'unread' } });
  section.append(element('h2', { text: 'Unread Ranges' }));
  const unreadIds = getUnreadComicIds(snapshot.comics, snapshot.meta.latestKnownComicId);
  const ranges = getUnreadRangesFromIds(unreadIds);
  section.append(element('p', {
    text: ranges.length > 0 ? formatRanges(ranges) : 'No unread comics in the known range.',
  }));

  const input = /** @type {HTMLInputElement} */ (element('input', {
    attrs: {
      type: 'text',
      placeholder: '1-10, 42, 100..120',
      'aria-label': 'Comic numbers or ranges',
    },
  }));
  section.append(element('h3', { text: 'Bulk Marking' }));
  section.append(element('div', {
    className: 'row',
    children: [
      input,
      button('Mark read', () => applyBulk(input.value, true)),
      button('Mark unread', () => applyBulk(input.value, false)),
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
  if (parsed.ids.length === 0) {
    showMessage(parsed.errors[0] ?? 'No valid comics selected.', true);
    return;
  }

  await storageService.updateManyComicStates(parsed.ids, { read });
  await refresh();
  showMessage(`${read ? 'Marked read' : 'Marked unread'}: ${parsed.ids.length} comic${parsed.ids.length === 1 ? '' : 's'}.`);
}

function renderSettings() {
  const settings = snapshot.settings;
  const section = element('section', { attrs: { id: 'settings' } });
  section.append(element('h2', { text: 'Settings' }));

  const autoReadEnabled = /** @type {HTMLInputElement} */ (element('input', { attrs: { type: 'checkbox' } }));
  autoReadEnabled.checked = settings.autoMarkRead.enabled;
  const autoReadDelay = /** @type {HTMLInputElement} */ (element('input', { attrs: { type: 'number', min: '0', max: '3600', value: String(settings.autoMarkRead.delaySeconds) } }));
  const altMode = selectFromOptions({
    [ALT_TEXT_MODES.NATIVE]: 'Native tooltip only',
    [ALT_TEXT_MODES.BELOW]: 'Show below comic',
    [ALT_TEXT_MODES.DELAYED]: 'Reveal after delay',
    [ALT_TEXT_MODES.HIDDEN]: 'No added display',
  }, settings.altText.mode);
  const altDelay = /** @type {HTMLInputElement} */ (element('input', { attrs: { type: 'number', min: '0', max: '3600', value: String(settings.altText.delaySeconds) } }));
  const ratingDisplay = selectFromOptions({
    [RATING_DISPLAY_MODES.HIDDEN]: 'Hidden',
    [RATING_DISPLAY_MODES.TEN_POINT]: '1-10',
    [RATING_DISPLAY_MODES.FIVE_STAR]: 'Five stars',
  }, settings.ratingDisplay);
  const progressDisplay = selectFromOptions({
    [PROGRESS_DISPLAY_MODES.HIDDEN]: 'Hidden',
    [PROGRESS_DISPLAY_MODES.TEXT]: 'Text only',
    [PROGRESS_DISPLAY_MODES.BAR]: 'Bar and text',
  }, settings.progressDisplay);
  const defaultBrowseMode = selectFromOptions({
    [BROWSE_MODES.ALL]: 'All comics',
    [BROWSE_MODES.UNREAD]: 'Unread comics',
    [BROWSE_MODES.FAVORITES]: 'Favorite comics',
  }, settings.navigation.defaultBrowseMode);
  const showExplainLink = /** @type {HTMLInputElement} */ (element('input', { attrs: { type: 'checkbox' } }));
  showExplainLink.checked = settings.navigation.showExplainLink;
  const updateBothNavBars = /** @type {HTMLInputElement} */ (element('input', { attrs: { type: 'checkbox' } }));
  updateBothNavBars.checked = settings.navigation.updateBothNavBars;
  const badgeEnabled = /** @type {HTMLInputElement} */ (element('input', { attrs: { type: 'checkbox' } }));
  badgeEnabled.checked = settings.badge.enabled;
  const checkEveryMinutes = /** @type {HTMLInputElement} */ (element('input', { attrs: { type: 'number', min: '30', max: '10080', value: String(settings.badge.checkEveryMinutes) } }));

  section.append(element('div', {
    className: 'field-grid',
    children: [
      field('Auto mark read', element('span', { className: 'inline-field', children: [autoReadEnabled, document.createTextNode('Enabled')] })),
      field('Auto mark delay seconds', autoReadDelay),
      field('Alt text display', altMode),
      field('Alt text delay seconds', altDelay),
      field('Rating control', ratingDisplay),
      field('Progress display', progressDisplay),
      field('Default browse mode', defaultBrowseMode),
      field('Explain link', element('span', { className: 'inline-field', children: [showExplainLink, document.createTextNode('Show Huh? link')] })),
      field('Navigation bars', element('span', { className: 'inline-field', children: [updateBothNavBars, document.createTextNode('Update both xkcd nav bars')] })),
      field('New comic badge', element('span', { className: 'inline-field', children: [badgeEnabled, document.createTextNode('Enabled')] })),
      field('Check interval minutes', checkEveryMinutes),
    ],
  }));

  section.append(element('div', {
    className: 'row',
    children: [button('Save settings', async () => {
      await storageService.saveSettings({
        autoMarkRead: {
          enabled: autoReadEnabled.checked,
          delaySeconds: Number(autoReadDelay.value),
        },
        altText: {
          mode: /** @type {import('../shared/types.js').AltTextMode} */ (altMode.value),
          delaySeconds: Number(altDelay.value),
        },
        ratingDisplay: /** @type {import('../shared/types.js').RatingDisplayMode} */ (ratingDisplay.value),
        progressDisplay: /** @type {import('../shared/types.js').ProgressDisplayMode} */ (progressDisplay.value),
        navigation: {
          defaultBrowseMode: /** @type {import('../shared/types.js').BrowseMode} */ (defaultBrowseMode.value),
          showExplainLink: showExplainLink.checked,
          updateBothNavBars: updateBothNavBars.checked,
        },
        badge: {
          enabled: badgeEnabled.checked,
          checkEveryMinutes: Number(checkEveryMinutes.value),
        },
      });
      await chrome.runtime.sendMessage({ type: 'xrt:update-badge' });
      await refresh();
      showMessage('Settings saved.');
    })],
  }));
  return section;
}

function renderDataTools() {
  const section = element('section', { attrs: { id: 'data' } });
  section.append(element('h2', { text: 'Import, Export, Reset' }));
  section.append(element('p', { className: 'muted', text: 'Import currently replaces existing tracker data after validation.' }));

  const fileInput = /** @type {HTMLInputElement} */ (element('input', { attrs: { type: 'file', accept: 'application/json' } }));
  section.append(element('div', {
    className: 'row',
    children: [
      button('Export backup', async () => {
        const backup = await storageService.exportBackup();
        downloadJson(`xkcd-reading-tracker-${new Date().toISOString().slice(0, 10)}.json`, backup);
      }),
      fileInput,
      button('Import replacement', async () => importReplacement(fileInput)),
    ],
  }));

  const confirmInput = /** @type {HTMLInputElement} */ (element('input', {
    attrs: {
      type: 'text',
      placeholder: 'Type RESET',
      'aria-label': 'Reset confirmation',
    },
  }));
  const resetRow = element('div', {
    className: 'row',
    children: [
      confirmInput,
      button('Download backup and reset', () => resetData(confirmInput.value, true), { className: 'danger' }),
      button('Reset without backup', () => resetData(confirmInput.value, false), { className: 'danger' }),
    ],
  });
  section.append(element('h3', { text: 'Reset' }));
  section.append(element('p', { className: 'muted', text: 'Reset removes read state, favorites, ratings, settings, continue point, metadata cache, and badge state.' }));
  section.append(resetRow);
  return section;
}

/**
 * @param {HTMLInputElement} fileInput
 */
async function importReplacement(fileInput) {
  const file = fileInput.files?.[0];
  if (!file) {
    showMessage('Choose a JSON backup first.', true);
    return;
  }

  const json = JSON.parse(await file.text());
  const result = await storageService.importBackupReplacingData(json);
  if (!result.ok) {
    showMessage(result.errors.join(' '), true);
    return;
  }

  await chrome.runtime.sendMessage({ type: 'xrt:update-badge' });
  await refresh();
  showMessage('Backup imported and replaced existing tracker data.');
}

/**
 * @param {string} confirmation
 * @param {boolean} withBackup
 */
async function resetData(confirmation, withBackup) {
  if (confirmation !== 'RESET') {
    showMessage('Type RESET before using a reset button.', true);
    return;
  }

  if (withBackup) {
    const backup = await storageService.exportBackup();
    downloadJson(`xkcd-reading-tracker-before-reset-${new Date().toISOString().slice(0, 10)}.json`, backup);
  }

  await storageService.resetTrackerData();
  await chrome.runtime.sendMessage({ type: 'xrt:update-badge' });
  await refresh();
  showMessage(withBackup ? 'Backup prepared for download and tracker data reset.' : 'Tracker data reset.');
}

function renderDiagnostics() {
  const section = element('section', { attrs: { id: 'diagnostics' } });
  section.append(element('h2', { text: 'Diagnostics' }));
  const rows = [
    ['Schema version', String(snapshot.meta.schemaVersion)],
    ['Latest known comic', snapshot.meta.latestKnownComicId ? `#${snapshot.meta.latestKnownComicId}` : 'Unknown'],
    ['Latest checked', snapshot.meta.latestCheckedAt ?? 'Never'],
    ['Acknowledged latest', snapshot.meta.acknowledgedLatestComicId ? `#${snapshot.meta.acknowledgedLatestComicId}` : 'None'],
    ['Last new comic', snapshot.meta.lastNewComicId ? `#${snapshot.meta.lastNewComicId}` : 'None'],
    ['Continue point', snapshot.meta.continuePoint ? `#${snapshot.meta.continuePoint}` : 'None'],
    ['Sync storage bytes', storageUsage?.syncBytes == null ? 'Unknown' : String(storageUsage.syncBytes)],
    ['Local storage bytes', storageUsage?.localBytes == null ? 'Unknown' : String(storageUsage.localBytes)],
    ['Extension sync keys', storageUsage ? String(storageUsage.syncKeys) : 'Unknown'],
  ];
  const table = element('table');
  const body = element('tbody');
  for (const [label, value] of rows) {
    body.append(element('tr', {
      children: [
        element('th', { text: label }),
        element('td', { text: value }),
      ],
    }));
  }
  table.append(body);
  section.append(table);
  return section;
}

function render() {
  app.replaceChildren(
    renderOverview(),
    renderFavorites(),
    renderUnread(),
    renderSettings(),
    renderDataTools(),
    renderDiagnostics()
  );
}

async function refresh() {
  snapshot = await storageService.getTrackerSnapshot();
  const favoriteIds = getFavoriteComicIds(snapshot.comics, snapshot.meta.latestKnownComicId);
  metadataById = await metadataCache.getCachedMetadataForComics(favoriteIds);
  storageUsage = await storageService.getStorageUsage();
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

