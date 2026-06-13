(async () => {
  try {
    const moduleUrl = chrome.runtime.getURL('src/content/page.js');
    const { initXkcdTracker } = await import(moduleUrl);
    await initXkcdTracker();
  } catch (error) {
    console.error('[xkcd tracker] Failed to initialize content script.', error);
  }
})();

