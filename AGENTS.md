# AGENTS.md

Guidance for AI coding agents and contributors working on Accessible Find in Page. `CLAUDE.md` is a symlink to this file, so edit this one.

## What this is

A Chromium (Manifest V3) extension that replaces the browser's find-in-page (Ctrl+F) for people with low vision. The maintainer has retinitis pigmentosa (narrow field of view, glare sensitivity), so accessibility is the product, not a feature: matches must be easy to see and easy to locate on the screen.

## Ground rules

- **Don't commit, push, or open branches or PRs unless explicitly asked.** The maintainer reviews changes first.
- Commit messages, when asked: `type(scope): summary` (`feat`, `fix`, `docs`, `chore`, `refactor`), as in the git log.
- **Verify before claiming something works:** `npm run typecheck`, `npm test` and `npm run test:e2e`. Every bug fix gets a regression test.
- **Use Node 22 or newer** (`nvm use` reads `.nvmrc`). WXT 0.21 won't run on Node 20.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev browser with live reload |
| `npm run build` | Production build into `.output/chrome-mv3` (load it unpacked) |
| `npm run zip` | Chrome Web Store zip |
| `npm run typecheck` | TypeScript |
| `npm test` | Unit tests (Vitest + happy-dom) |
| `npm run test:e2e` | Builds with `--mode e2e`, then runs Playwright against real Chromium |
| `SCREENSHOTS=<dir> npm run test:e2e -- screenshots` | UI screenshots, light and dark |
| `REAL_KEYS=1 xvfb-run -a npm run test:e2e -- real-keys` | Real key presses and real speech (needs `xdotool`; it moves the pointer and types, so keep it on a virtual display) |
| `npm run icons` | Re-render `public/icon/*.png` from `assets/brand/*.svg` |
| `npm run store-assets` | Chrome Web Store screenshots, promo tiles and icon into `store/` (listing text in `store/LISTING.md`) |
| `npm run store-video` | The listing's demo video, `store/demo.mp4` (needs `ffmpeg`) |

## Where things live

- `src/entrypoints/background.ts`: service worker. Opens the finder from the keyboard command, the toolbar button, or the every-site Ctrl+F hotkey, and asks it to read aloud from the read aloud command (Alt+R). Shows the "can't run here" popup. Keeps the hotkey script registered to match the optional permission.
- `src/entrypoints/finder.ts`: content script injected on demand into the top frame. Registers `globalThis.__accessibleFind` in the isolated world.
- `src/entrypoints/hotkey.ts`: tiny content script on every page, only in every-site mode. Turns Ctrl+F into "open finder", and nothing else (see page access keys under Gotchas).
- `src/lib/search/`: pure search engine. Builds a flat text index of the rendered (flat) tree, folds case and accents, and maps matches back to DOM Ranges. Unit-tested.
- `src/lib/finder/`: the in-page side. `finder.ts` (session coordinator), `highlighter.ts` (CSS Custom Highlight API), `overlay.ts` (top-layer host, closed shadow root, find bar iframe), `effects.ts` (box, spotlight, guides, magnifier, ring), `geometry.ts` (rects, scrolling), `tone.ts` (light or dark page, for the automatic style).
- `src/pages/`: React UIs. `findbar` runs inside the iframe (with the results list and quick settings panels), `options` is the settings page, `unavailable` is the toolbar popup, `practice` is the practice page.
- `src/pages/options/`: the settings show one page at a time, chosen by the URL hash (`#appearance`, `#display`...; `#welcome` and `#whats-new` add a message to the first page). `OptionsApp.tsx` has the navigation; each page's content is a `*Section.tsx`.
- `src/lib/history.ts`: recent searches in `storage.local`. `src/lib/speech.ts`: read aloud with the Web Speech API; the finder does all the speaking (`Finder.readAloud`).
- `src/lib/shortcuts.ts`: the find bar's changeable shortcuts, stored as strings like `Ctrl+Alt+KeyC` (physical `KeyboardEvent.code`), with validation.
- `src/lib/settings/transfer.ts`: backup and shared-profile files. Bump `FILE_VERSION` when their layout changes, and keep older files importing.
- `src/lib/settings/`: types, defaults, sanitizing, the v1 to v2 migration (`schema.ts`) and the `chrome.storage.sync` access (`store.ts`). Built-in profiles ship in `defaults.ts`; the user's changes to one are stored under `profile:<its id>` (never in `profileOrder`), and resetting removes that key.
- `src/components/ui/`: shadcn/ui components (ours to edit). `src/components/`: composed components. `preview.tsx` draws sample text the way matches look on a page, for the light and dark preview and the hover-card examples of each effect; it mirrors `src/lib/finder/effects.ts`, so change them together.
- `docs/BRAND.md`: brand and design rules. Read it before touching UI.
- `store/`: the Web Store images and listing text. `PRIVACY.md` is the privacy policy the listing links to; keep it true when the extension starts storing or sending anything new.

## Invariants: don't break these

1. **Never modify the page's DOM to highlight.** Highlights are CSS Custom Highlight API ranges, and visuals live in the overlay's closed shadow root. The only exceptions are the overlay host element, and opening `<details>` / `hidden="until-found"` when the user moves to a match inside one (as the browser's find does). Never reveal on automatic refreshes.
2. **Never put page text into `innerHTML`** (that was v1's XSS bug). Use `textContent` and Ranges.
3. **Functions passed to `chrome.scripting.executeScript({ func })` are serialized.** They must be self-contained: no imports, no closures. Chrome doesn't reject when the injected function throws, so return a value and check it.
4. **Install-time permissions stay `activeTab`, `scripting`, `storage`.** Any new required permission, especially host permissions, disables the extension for every existing user until they accept it. All-sites access stays in `optional_host_permissions` and is requested only from a user gesture.
5. **Keep the command names `open_popup` and `read_aloud`.** Chrome stores users' custom shortcuts by command name.
6. **Settings are versioned** (`schemaVersion` in sync storage). A new field only needs a default in `sanitize*`; renaming, moving or removing one needs a migration in `schema.ts` with unit tests. Always read through `sanitize*`. Writes are debounced, because sync storage allows about 120 writes a minute and 8 KB per item.
7. **The page and the find bar talk only over the private `MessageChannel`.** The iframe URL carries a nonce, and the port is posted to `chrome-extension://${runtime.id}`, not the iframe's `src` origin: with `use_dynamic_url` they differ, and the message would be silently dropped.
8. **Motion is opt-out-able and safe.** Blinking stays at or under 3 flashes a second (interval at least 200 ms). No blinking or ring animation when the user or the OS asks for reduced motion.
9. **Every-site hotkey copies already running in tabs obey `hotkeyEnabled` in `storage.local`.** Keep it in sync with the permission (`syncHotkeyScript` does).
10. **Recent searches stay in `storage.local`, never in sync storage,** and are deleted when the user turns remembering off. Searches never leave the device.

## UI rules

- Follow `docs/BRAND.md`: Atkinson Hyperlegible Next, night / beam / signal colors, plain-language copy.
- Size everything in `rem`. The text-size preference sets the root font size on every extension page.
- Never use color alone for state. Keep focus rings visible (solid, offset), controls at least 40 px at default size, and text at WCAG AA contrast or better.
- After `npx shadcn add`, give the new component the same treatment as the others: opaque focus ring with offset, `rem` sizes, a strong pressed or checked state, real headings.
- Inside the find bar iframe, avoid components that open pop-ups (Select, Popover, Tooltip, Dialog). The iframe is sized to its content, so they get cut off; use `NativeSelect` and inline panels. The exception is the example hover cards of `SwitchField`, which place themselves beside the field and inside the frame. An Escape that closed one arrives `defaultPrevented`, and the bar ignores it.
- Keep the find bar's search box wide: the match count and options sit outside it, so nothing covers what's typed, at any text size.
- Don't disable buttons or fields: greyed-out controls are hard to see and don't say why. Leave out what doesn't apply, or let the control explain (a message) when it can't act.
- On the settings page, lay out with container queries (`@container`, `@xl:`...), not `sm:`/`md:`/`lg:`. Media queries measure `rem` in the browser's default 16 px, so they ignore the text size preference; container queries follow it.

## Gotchas

- The shadcn CLI resolves `@/` through the root `tsconfig.json` `paths`. Keep them: without them it resolves WXT's `.wxt/tsconfig.json` paths relative to the repo root and writes files outside the repo.
- Playwright is pinned to 1.58.2 to match the locally installed Chromium build. Headless Chromium can't trigger browser-level shortcuts, so tests call `__e2e.openFinder` and `__e2e.readAloud` in the service worker (they only exist in `--mode e2e` builds) or press Ctrl+F to exercise the every-site hotkey. `real-keys.spec.ts` presses the real keys.
- The e2e build is pre-granted `<all_urls>` (tests can't click permission prompts). The production build isn't.
- Chrome resets per-tab toolbar state (popup, badge, title) on navigation by itself. Don't add a `tabs.onUpdated` listener for that: it wakes the service worker on every page load in every tab.
- The practice page is an extension page, which can't be scripted. It runs `Finder` itself (limited to its article with the `root` option) and handles Ctrl+F. The background asks it to open or read with `EXTENSION_PAGE_MESSAGE` when injection fails.
- Selected text: the every-site hotkey sends its own frame's selection (the top page can't see a frame's). With the keyboard shortcut, the background asks the focused frame instead. When the bar is already open, Ctrl+F takes the page selection only if the page, not the bar, has focus.
- Never hard-code the find bar's option shortcuts in UI text: users change them. Show `formatCombo(prefs.shortcuts.<action>)`.
- Automatic style (on by default) works match by match: a match on a dark background (`textTone` in `tone.ts`: light text means a dark background, else the background color behind it) takes the highlight colors of `autoProfile.dark` (`withColorsFrom` in `schema.ts`), painted in the `-dark` highlights. Other matches use the active profile, and effects, sizes and timings always come from the active profile. The page's overall tone (`detectPageTone`) is only for the find bar's wording and examples.
- Reading aloud happens in the page (the finder's content script), never in the find bar iframe. Chrome lets a page speak only once the user has clicked or typed in it, or in the find bar (its child frame). The read aloud browser shortcut doesn't count, but selecting text, clicking where to read and typing in a text box or the find bar all do. Headless Chrome has no voices, so e2e builds report what would be said to the service worker (`__e2e.spoken`). `speech.ts` keeps each utterance referenced until it ends: Chrome can garbage-collect one mid-sentence, and its end event then never fires.
- Playwright's `evaluate()` counts as a user gesture, and headless Chrome is laxer about autoplay. To check anything that needs user activation, use real clicks and keys in headed Chromium, as `real-keys.spec.ts` does; its fake voice (`tests/e2e/fake-tts`) records what Chrome really says.
- Page access keys: on Windows and Linux, Chrome follows a page's `accesskey` on Alt+letter (with or without Shift) even when a script cancels the key press, so a content script can't own an Alt+letter key on every page (Alt+R is "Recent changes" on Wikipedia). That's why read aloud is a browser command with a suggested key (`wxt.config.ts`): Chrome handles those before the page. Chrome assigns a suggested key on install and on update, unless the user already changed that command's key or another extension has it. Playwright's keys trigger neither access keys nor browser commands.
- happy-dom has no layout. Unit tests pass their own `isRendered` / `isTextVisible` (and `displayOf` where happy-dom's computed `display` differs from a browser's, such as flex items) to `buildTextIndex`; anything layout-dependent needs an e2e test.
- The find bar never covers the current match: scrolling centers the match in the part of the screen the bar leaves free, and when the page can't scroll that far, `Overlay.uncover` moves the bar along its edge or to the other edge, and back once its own place is clear. It only moves when the user moves to a match, never on scrolling, resizing or a settings change, so it doesn't jump from under the pointer.
- The text index follows the layout like Chrome's find: block-level boxes (flex and grid items included) and inline blocks with text are blocks of their own, so matches never run from one into the next.
- The reduced-motion rule in `globals.css` cuts every CSS animation to 0.01 ms, so a looping CSS animation would flicker instead of stopping. Anything that repeats (the blink and ring examples) runs on timers and the Web Animations API, and only while `useReducedMotion` allows it, which also honors the "Blinking and animation" setting.
- Chrome styles every extension page's `body` with the system's UI font at 75% size. The unlayered `html body` rule in `globals.css` overrides that; keep it outside `@layer`, or the UI falls back to a smaller system font.
- Known limitations: no search inside iframes, form fields or the PDF viewer; browser pages and the Web Store are off-limits to all extensions. Pages can see the CSS highlight registry and the overlay element while the bar is open.
