# Firefox Add-ons listing

What to fill in on [addons.mozilla.org](https://addons.mozilla.org/developers/) (AMO) for version 2. The screenshots are the same as the Chrome Web Store's (`store/screenshots/`, made by `npm run store-assets`); AMO has no video field.

## Files

- **Add-on:** `.output/accessible-find-in-page-<version>-firefox.zip`, from `npm run zip:firefox`. Firefox (desktop) only: the find bar relies on keyboard shortcuts and Firefox for Android has none for extensions.
- **Source code:** `.output/accessible-find-in-page-<version>-sources.zip`, made by the same command. AMO asks for it because the code is bundled. Building it gives a byte-identical add-on (checked by unzipping it into an empty folder and building there).

## Describe add-on

- **Name:** Accessible Find in Page
- **Add-on URL:** `accessible-find-in-page`
- **Summary** (250 characters at most):

```text
Find in page (Ctrl+F) for low vision: big, high-contrast highlights, a ring, spotlight, guide lines and magnifier to spot the current match, every match in one list in large text, and read aloud.
```

- **Categories:** Search Tools, Appearance
- **Tags:** search (AMO only offers a fixed list, with no accessibility tag)
- **Screenshots:** the five in `store/screenshots/`, in order, each captioned with its headline and line (the captions are their alt text)
- **Support website:** https://github.com/bearkillerPT/AccessibleFind-in-page/issues
- **Homepage:** https://github.com/bearkillerPT/AccessibleFind-in-page
- **License:** MIT
- **Privacy policy:** none needed (nothing is collected; the manifest declares `data_collection_permissions: none`). Link to `PRIVACY.md` from the description instead.

**Description** (Markdown, which AMO supports):

```markdown
Accessible Find replaces the browser's find in page (Ctrl+F) with one made for people with low vision. Matches are big, bright and easy to tell apart, and the one you're on is easy to find on the screen.

I made it because I have retinitis pigmentosa, which narrows my field of view. I kept losing the browser's own pale highlights, so I built the find I needed.

**Highlights you can see**

- Your own colors for every match and for the current one, with an underline and a border, so color isn't the only cue.
- Profiles for your eyes: cataracts, light sensitivity, and red-green, blue-yellow or no color vision. Or make your own; a contrast check tells you when text would be hard to read.
- Automatic style: matches on a dark background, on a dark website or in a code block, switch to colors made for dark backgrounds.

**Find the current match quickly**

- Matches blink briefly and a ring closes in on the current one, as slowly and as thick as you like. Both can be turned off, and they follow your system's reduce motion setting.
- Turn on a spotlight that dims the rest of the page, guide lines that reach a narrow field of view, or a magnifier that repeats the match in large text right beside it, for when the middle of your sight is missing.
- The find bar steps aside if it would cover the match.

**Read, don't hunt**

- A list of every match with the words around it, in large text. Move through it with the arrow keys and the page follows.
- Read aloud: hear the sentence around the match, or have each match read as you move to it. Paste any text into the find bar to hear it too. Select text on any page and press your read aloud shortcut to hear it, even with the find bar closed (check or set it on Firefox's extension shortcuts page; the settings take you there).

**A find bar built for low vision**

- Text size from 100% to 300%, light and dark themes, and six places on the screen.
- Set in Atkinson Hyperlegible Next, a typeface designed for low-vision readers.
- Match case, match accents and whole words, and your recent searches on the arrow keys.
- Every action has a keyboard shortcut, and you can change them. Screen readers hear the match count and the words around the match.

**Works the way you expect**

- Opens with Ctrl+F on every website (if you allow it), or with Alt+Shift+F or the toolbar button.
- Finds text across links and formatting, and ignores accents unless you ask: "acao" finds "Ação".
- Opens collapsed sections that contain a match, like the browser's own find.
- Highlights are drawn by the browser without changing the page, so web apps and editors keep working.
- A practice page to try everything safely.

**Private by design**

Accessible Find reads a page only when you search it, on your device. There are no accounts, ads or analytics, and nothing is sent to the developer. Recent searches stay on this device, and you can turn them off. Read aloud uses your browser's voices; the settings point out the online ones, which send what's read to the browser's speech service. Privacy policy: https://github.com/bearkillerPT/AccessibleFind-in-page/blob/main/PRIVACY.md

**Where it can't run**

Firefox doesn't let any extension run on its own pages (about: pages), on addons.mozilla.org and some other Mozilla sites, or in its built-in PDF viewer. With Ctrl+F on every website turned on, those pages get Firefox's own find instead; otherwise Accessible Find tells you why, and how to open Firefox's own find. Text inside embedded frames and form fields isn't searched yet.

Free and open source. Ideas and bug reports are welcome on GitHub: https://github.com/bearkillerPT/AccessibleFind-in-page
```

## Notes to reviewer

```text
Build: on any operating system (tested on Linux) with Node.js 22 or newer and npm 10 (tested with Node.js 22.22.3 and npm 10.9.8), run `npm ci` and then `npm run build:firefox`. The add-on is in .output/firefox-mv3 and matches the uploaded file byte for byte. (WXT + Vite + React; the source code zip is from `npm run zip:firefox`.)

Permissions: activeTab, scripting and storage. The find bar is injected into the current tab only when the user opens it (toolbar button or keyboard shortcut). <all_urls> is optional: requested only if the user turns on "Ctrl+F on every website" in the settings, so a small script (hotkey.js) can turn Ctrl+F into "open Accessible Find" on every page.

wrappedJSObject: used in one place, src/lib/finder/highlighter.ts (pageView), only to add the extension's own constructed style sheet (the ::highlight() rules that color the matches) to the page's document.adoptedStyleSheets, which Xray wrappers can't reach into. No page data is read through it.

innerHTML warnings: both are React DOM's own code (dangerouslySetInnerHTML support) in the bundled React; the extension never uses innerHTML, and page text only ever goes into textContent and DOM Ranges.

Nothing is collected or sent anywhere (data_collection_permissions: none). Reading aloud uses the Web Speech API. To try it: open any article, press Alt+Shift+F (or click the toolbar button), and type a word. The settings include a practice page.
```

## Release notes for 2.0.0

```text
First release for Firefox. Accessible Find 2 is a complete rewrite: highlights drawn by the browser without changing the page, color profiles for different eye conditions with colors for light and dark backgrounds, a ring, spotlight, guide lines and magnifier to spot the current match, a list of every match in large text, read aloud, and changeable keyboard shortcuts.
```
