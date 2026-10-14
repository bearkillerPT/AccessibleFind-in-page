// Code passed to worker.evaluate() runs in the extension's service worker, where `chrome` exists.
declare const chrome: typeof import('wxt/browser').browser;
