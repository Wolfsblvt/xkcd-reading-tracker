import { LOCAL_METADATA_KEY } from '../shared/constants.js';
import { coerceComicId } from '../shared/comic-state.js';

/**
 * @param {Record<string, any>} raw
 * @returns {import('../shared/types.js').ComicMetadata | null}
 */
function normalizeMetadata(raw) {
  const num = coerceComicId(raw.num);
  if (num === null) {
    return null;
  }

  return {
    num,
    title: String(raw.title ?? raw.safe_title ?? `xkcd #${num}`),
    safeTitle: String(raw.safe_title ?? raw.title ?? `xkcd #${num}`),
    alt: String(raw.alt ?? ''),
    img: String(raw.img ?? ''),
    year: String(raw.year ?? ''),
    month: String(raw.month ?? ''),
    day: String(raw.day ?? ''),
    fetchedAt: typeof raw.fetchedAt === 'string' ? raw.fetchedAt : new Date().toISOString(),
  };
}

/**
 * @returns {Promise<{ byId: Record<string, import('../shared/types.js').ComicMetadata>, latestKnownComicId: number | null }>}
 */
async function readMetadataStore() {
  const stored = await chrome.storage.local.get(LOCAL_METADATA_KEY);
  const raw = stored[LOCAL_METADATA_KEY] && typeof stored[LOCAL_METADATA_KEY] === 'object'
    ? stored[LOCAL_METADATA_KEY]
    : {};
  const byId = {};

  if (raw.byId && typeof raw.byId === 'object') {
    for (const [id, value] of Object.entries(raw.byId)) {
      if (!value || typeof value !== 'object') {
        continue;
      }
      const metadata = normalizeMetadata(value);
      if (metadata) {
        byId[id] = metadata;
      }
    }
  }

  return {
    byId,
    latestKnownComicId: coerceComicId(raw.latestKnownComicId),
  };
}

/**
 * @param {{ byId: Record<string, import('../shared/types.js').ComicMetadata>, latestKnownComicId: number | null }} store
 * @returns {Promise<void>}
 */
async function writeMetadataStore(store) {
  await chrome.storage.local.set({ [LOCAL_METADATA_KEY]: store });
}

/**
 * @param {number | 'latest'} comicId
 * @returns {string}
 */
function getMetadataUrl(comicId) {
  return comicId === 'latest'
    ? 'https://xkcd.com/info.0.json'
    : `https://xkcd.com/${comicId}/info.0.json`;
}

/**
 * @param {number | 'latest'} comicId
 * @returns {Promise<import('../shared/types.js').ComicMetadata>}
 */
export async function fetchComicMetadata(comicId) {
  const response = await fetch(getMetadataUrl(comicId), {
    credentials: 'omit',
    cache: 'no-cache',
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch xkcd metadata: HTTP ${response.status}`);
  }

  const raw = await response.json();
  const metadata = normalizeMetadata(raw);
  if (!metadata) {
    throw new Error('xkcd metadata response did not include a valid comic number.');
  }

  return metadata;
}

/**
 * @param {number} comicId
 * @returns {Promise<import('../shared/types.js').ComicMetadata | null>}
 */
export async function getCachedComicMetadata(comicId) {
  const id = coerceComicId(comicId);
  if (id === null) {
    return null;
  }

  const store = await readMetadataStore();
  return store.byId[String(id)] ?? null;
}

/**
 * @param {number} comicId
 * @returns {Promise<import('../shared/types.js').ComicMetadata>}
 */
export async function getOrFetchComicMetadata(comicId) {
  const cached = await getCachedComicMetadata(comicId);
  if (cached) {
    return cached;
  }

  const metadata = await fetchComicMetadata(comicId);
  await saveComicMetadata(metadata);
  return metadata;
}

/**
 * @returns {Promise<import('../shared/types.js').ComicMetadata>}
 */
export async function fetchLatestComicMetadata() {
  const metadata = await fetchComicMetadata('latest');
  await saveComicMetadata(metadata);
  return metadata;
}

/**
 * @param {import('../shared/types.js').ComicMetadata} metadata
 * @returns {Promise<void>}
 */
export async function saveComicMetadata(metadata) {
  const store = await readMetadataStore();
  store.byId[String(metadata.num)] = {
    ...metadata,
    fetchedAt: new Date().toISOString(),
  };
  store.latestKnownComicId = Math.max(store.latestKnownComicId ?? 0, metadata.num);
  await writeMetadataStore(store);
}

/**
 * @param {number[]} comicIds
 * @returns {Promise<Record<string, import('../shared/types.js').ComicMetadata>>}
 */
export async function getCachedMetadataForComics(comicIds) {
  const store = await readMetadataStore();
  const result = {};
  for (const id of comicIds) {
    const metadata = store.byId[String(id)];
    if (metadata) {
      result[String(id)] = metadata;
    }
  }
  return result;
}

export const metadataCache = Object.freeze({
  fetchComicMetadata,
  fetchLatestComicMetadata,
  getCachedComicMetadata,
  getCachedMetadataForComics,
  getOrFetchComicMetadata,
  saveComicMetadata,
});

