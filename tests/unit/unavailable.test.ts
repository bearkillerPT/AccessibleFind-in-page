import { describe, expect, it, vi } from 'vitest';

vi.mock('wxt/browser', () => ({ browser: { extension: { isAllowedFileSchemeAccess: async () => false } } }));
const { classifyInjectionError } = await import('../../src/lib/background/unavailable');

describe('pages the extension can’t run on', () => {
  it('are told apart by Chrome’s errors', async () => {
    expect(await classifyInjectionError(new Error('Cannot access a chrome:// URL'), 'chrome://settings/')).toBe(
      'browser-page',
    );
    const gallery = new Error('The extensions gallery cannot be scripted.');
    expect(await classifyInjectionError(gallery, 'https://chromewebstore.google.com/detail/x')).toBe('store');
    const file = new Error('Cannot access contents of url "file:///home/a.html".');
    expect(await classifyInjectionError(file, 'file:///home/a.html')).toBe('file');
  });

  it('and by the address in Firefox, whose error is the same everywhere', async () => {
    const firefox = new Error('Missing host permission for the tab');
    expect(await classifyInjectionError(firefox, 'https://addons.mozilla.org/en-US/firefox/')).toBe('store');
    expect(await classifyInjectionError(firefox, 'https://support.mozilla.org/kb/x')).toBe('mozilla-site');
    expect(await classifyInjectionError(firefox, 'https://example.com/report.pdf?page=2')).toBe('pdf');
    // Firefox hides the address of about: and view-source: pages.
    expect(await classifyInjectionError(firefox, undefined)).toBe('browser-page');
    expect(await classifyInjectionError(firefox, 'https://example.com/')).toBe('blocked');
  });
});
