import fs from 'node:fs';

const BROWSER_CONFIGS = {
  chromium: {
    id: 'chromium',
    label: 'Playwright Chromium',
    engine: 'chromium',
    channel: 'chromium',
  },
  edge: {
    id: 'edge',
    label: 'Microsoft Edge',
    engine: 'chromium',
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  },
  chrome: {
    id: 'chrome',
    label: 'Google Chrome',
    engine: 'chromium',
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  },
  brave: {
    id: 'brave',
    label: 'Brave',
    engine: 'chromium',
    executablePath: 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
  },
  opera: {
    id: 'opera',
    label: 'Opera',
    engine: 'chromium',
    executablePath: 'C:\\Users\\Administrator\\AppData\\Local\\Programs\\Opera\\opera.exe',
  },
  firefox: {
    id: 'firefox',
    label: 'Mozilla Firefox',
    engine: 'firefox',
    executablePath: 'C:\\Program Files\\Mozilla Firefox\\firefox.exe',
  },
};

export const listKnownBrowserConfigs = () => Object.values(BROWSER_CONFIGS);

export const resolveBrowserConfig = (browserId = 'edge') => {
  const normalizedId = `${browserId || 'edge'}`.trim().toLowerCase();
  const config = BROWSER_CONFIGS[normalizedId];

  if (!config) {
    throw new Error(`Unsupported browser "${browserId}". Expected one of: ${Object.keys(BROWSER_CONFIGS).join(', ')}`);
  }

  if (config.executablePath && !fs.existsSync(config.executablePath)) {
    throw new Error(`${config.label} is not installed at ${config.executablePath}`);
  }

  return config;
};
