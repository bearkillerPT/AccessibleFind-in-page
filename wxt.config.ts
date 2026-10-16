import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: ({ mode }) => ({
    name: 'Accessible Find in Page',
    // The Web Store's summary line: 132 characters at most.
    description:
      'Find in page (Ctrl+F) for low vision: big, high-contrast highlights, a spotlight and magnifier on the match, and read aloud.',
    minimum_chrome_version: '121',
    permissions: ['activeTab', 'scripting', 'storage'],
    // Granted at runtime, only if the user turns on "Ctrl+F on every website".
    optional_host_permissions: ['<all_urls>'],
    // End-to-end tests can't click permission prompts, so the test build is pre-granted.
    ...(mode === 'e2e' ? { host_permissions: ['<all_urls>'] } : {}),
    action: {
      default_title: 'Find in page (Accessible Find)',
      default_icon: { 16: 'icon/16.png', 32: 'icon/32.png' },
    },
    commands: {
      // Keep this name: Chrome stores users' custom shortcuts by command name.
      open_popup: {
        description: 'Open Accessible Find',
        // Chrome refuses to auto-assign Ctrl+F (it's a browser shortcut), so suggest a
        // key that does get assigned. Users can still map Ctrl+F manually.
        suggested_key: { default: 'Alt+Shift+F' },
      },
      // A browser shortcut, not a key caught in the page: Chrome handles it before the page,
      // so it can't set off the page's own access keys (Alt+R is "Recent changes" on Wikipedia).
      // On macOS, ⌥R would steal the ® key from every text field, hence ⌃⇧R.
      read_aloud: {
        description: 'Read aloud the selected text',
        suggested_key: { default: 'Alt+R', mac: 'MacCtrl+Shift+R' },
      },
    },
    web_accessible_resources: [
      {
        resources: ['findbar.html', 'fonts/*.woff2'],
        matches: ['<all_urls>'],
        // Stops websites from probing a fixed URL to detect the extension.
        use_dynamic_url: true,
      },
    ],
  }),
});
