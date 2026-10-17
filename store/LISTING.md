# Chrome Web Store listing

What to fill in on the [Developer Dashboard](https://chrome.google.com/webstore/devconsole) for version 2. The images in this folder are made by `npm run store-assets`; run it again after changing the UI.

## Package

Upload the zip from `npm run zip` (`.output/accessible-find-in-page-<version>-chrome.zip`). The title and summary come from the manifest (`wxt.config.ts`):

- **Title:** Accessible Find in Page
- **Summary** (132 characters at most): Find in page (Ctrl+F) for low vision: big, high-contrast highlights, a spotlight and magnifier on the match, and read aloud.

## Store listing tab

**Description:**

```text
Accessible Find replaces the browser's find in page (Ctrl+F) with one made for people with low vision. Matches are big, bright and easy to tell apart, and the one you're on is easy to find on the screen.

I made it because I have retinitis pigmentosa, which narrows my field of view. I kept losing the browser's own pale highlights, so I built the find I needed.

HIGHLIGHTS YOU CAN SEE
• Your own colors for every match and for the current one, with an underline and a border, so color isn't the only cue.
• Profiles for your eyes: cataracts, light sensitivity, and red-green, blue-yellow or no color vision. Or make your own; a contrast check tells you when text would be hard to read.
• Automatic style: matches on a dark background, on a dark website or in a code block, switch to colors made for dark backgrounds.

FIND THE CURRENT MATCH QUICKLY
• Matches blink briefly and a ring closes in on the current one, as slowly and as thick as you like. Both can be turned off, and they follow your system's reduce motion setting.
• Turn on a spotlight that dims the rest of the page, guide lines that reach a narrow field of view, or a magnifier that repeats the match in large text right beside it, for when the middle of your sight is missing.
• The find bar steps aside if it would cover the match.

READ, DON'T HUNT
• A list of every match with the words around it, in large text. Move through it with the arrow keys and the page follows.
• Read aloud: hear the sentence around the match, or have each match read as you move to it. Paste any text into the find bar to hear it too. Select text on any page and press your read aloud shortcut to hear it, even with the find bar closed. Set it once on Chrome's extension shortcuts page (the settings take you there).

A FIND BAR BUILT FOR LOW VISION
• Text size from 100% to 300%, light and dark themes, and six places on the screen.
• Set in Atkinson Hyperlegible Next, a typeface designed for low-vision readers.
• Match case, match accents and whole words, and your recent searches on the arrow keys.
• Every action has a keyboard shortcut, and you can change them. Screen readers hear the match count and the words around the match.

WORKS THE WAY YOU EXPECT
• Opens with Ctrl+F on every website (if you allow it), or with Alt+Shift+F or the toolbar button.
• Finds text across links and formatting, and ignores accents unless you ask: "acao" finds "Ação".
• Opens collapsed sections that contain a match, like the browser's own find.
• Highlights are drawn by the browser without changing the page, so web apps and editors keep working.
• A practice page to try everything safely.

PRIVATE BY DESIGN
Accessible Find reads a page only when you search it, on your device. There are no accounts, ads or analytics, and nothing is sent to the developer. Recent searches stay on this device, and you can turn them off.

WHERE IT CAN'T RUN
Browsers don't let any extension run on their own pages (settings, the new tab page), on the Chrome Web Store, or in the built-in PDF viewer. With Ctrl+F on every website turned on, those pages get the browser's own find instead; otherwise Accessible Find tells you why, and how to open the browser's own find. Text inside embedded frames and form fields isn't searched yet.

Free and open source. Ideas and bug reports are welcome on GitHub: https://github.com/bearkillerPT/AccessibleFind-in-page
```

**Category:** Accessibility. **Language:** English.

**Graphic assets:**

| Field | File |
| --- | --- |
| Store icon (128×128) | `icon-128.png` (the same as `public/icon/128.png`) |
| Screenshots (1280×800, in this order) | `screenshots/1-find-bar.png` … `screenshots/5-dark-pages.png` |
| Small promo tile (440×280) | `promo-small.png` |
| Marquee promo tile (1400×560) | `promo-marquee.png` |
| YouTube video | Upload `demo.mp4` (made by `npm run store-video`) to YouTube, as public or unlisted, and paste its link here. It replaces the version 1 video. Suggested title: "Accessible Find: find in page for low vision". |

**Additional fields:**

- **Homepage URL:** https://github.com/bearkillerPT/AccessibleFind-in-page
- **Support URL:** https://github.com/bearkillerPT/AccessibleFind-in-page/issues
- **Mature content:** off

## Privacy tab

**Single purpose:**

```text
Accessible Find replaces the browser's find in page with one designed for people with low vision. It searches the text of the current page and highlights the matches in large, high-contrast, customizable styles, with optional aids to locate the current match and read it aloud.
```

**Permission justifications:**

| Permission | Justification |
| --- | --- |
| `activeTab` | When the user opens Accessible Find (toolbar button or keyboard shortcut), it gives temporary access to that tab only, so the extension can search the page's text and draw the highlights. |
| `scripting` | Injects the find bar and search code into the current tab when the user opens it. When the user turns on "Ctrl+F on every website", it also registers the small script that turns Ctrl+F into "open Accessible Find". |
| `storage` | Saves the user's settings and highlight profiles, and their recent searches on the device (unless turned off). |
| Host permission `<all_urls>` | Optional, never requested at install. Asked for only when the user turns on "Ctrl+F on every website" in the settings, because the extension has to be present on each page to notice Ctrl+F before the browser's own find opens. It reads a page's text only when the user searches it, on the device, and sends nothing anywhere. |

**Remote code:** No, I am not using remote code.

**Data usage:** tick none of the data types: nothing is collected, since nothing the extension handles ever leaves the device. Then tick all three certifications (not sold, not used for unrelated purposes, not used for creditworthiness). The listing then says the developer "will not collect or use your data". Google also asks for data that's only handled on the device to be explained ([User Data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)): the privacy policy below does that (it reads pages to search them, and keeps settings and recent searches in the browser).

**Privacy policy URL:** https://github.com/bearkillerPT/AccessibleFind-in-page/blob/main/PRIVACY.md

## Account

The publisher name under "Offered by" is **BearkillerPT**. It's set on the dashboard's **Account** page (**Publisher name**), for all your listings.
