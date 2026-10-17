/**
 * Records the narrated demo video for the Chrome Web Store listing (upload it to YouTube): the
 * real extension, filmed scene by scene, with the camera moving in on what matters, a narrow
 * field of view shown as a mask, keycaps for the keys pressed, and subtitles for every line.
 * Only runs when STORE_VIDEO is set:  npm run store-video  (writes store/demo.mp4; needs
 * ffmpeg and the Kokoro voice, see video/narration.ts)
 */
import type { Frame, Page, Worker } from '@playwright/test';
import { mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, findBar, goto, launch, openViaCommand, readViaCommand, test as base } from './harness';
import { dataUrl, ICON_EDGE, marked, setEffects, setPrefs } from './store-art';
import { compose } from './video/compose';
import { E2E_PRETEND_SPEECH_KEY } from '../../src/lib/messages';
import { narrate, READER_VOICE, type Line } from './video/narration';
import {
  centerOf,
  currentMatch,
  frameBox,
  hidePointer,
  NO_MASK,
  pointAt,
  pointTo,
  Recorder,
  SCALE,
  type Box,
  sleep,
  VIEW,
  WHOLE_PAGE,
} from './video/recorder';

const OUT = process.env.STORE_VIDEO;

/** Everything the narrator says, in order. */
const SCRIPT = {
  title: 'This is Accessible Find: find in page, made for people with low vision.',
  narrow: 'Retinitis pigmentosa narrows your field of view, until you see only a small part of the screen at a time.',
  lost: 'With the browser’s own find, the match is often somewhere you can’t see.',
  made: 'Accessible Find was made by someone who lives with it.',
  press: 'Press Control F, and type what you’re looking for.',
  lit: 'Every match lights up in bold colors, and blinks, so you notice it.',
  ring: 'Press Enter for the next match. A ring closes in on it from the edges of the screen, so even a narrow view catches it.',
  help: 'There’s more help in the find bar: guide lines that cross at the match, a spotlight that dims everything else, and a magnifier that repeats it in large text.',
  follow: 'Follow a guide line, and it leads you straight to the match.',
  list: 'Press Alt L to read every match in one list, in large text. The arrow keys move through them, and the page follows.',
  readMatch: 'Press Alt R, or the speaker button, to hear the sentence around the match.',
  readSelection: 'Or select text, press Control F, then Alt R.',
  readPasted: 'It reads text from anywhere: paste it in, and press Alt R.',
  shortcut: 'To read without the find bar, choose a shortcut in the Read aloud settings.',
  shortcutPage: 'Chrome opens its shortcuts page: press the pencil, then your keys.',
  readAnywhere: 'Now select text on any page, and press it.',
  light: 'Matches pick their colors for the background they’re on, so they stand out on light pages too.',
  profiles:
    'In the settings, choose a profile for your eyes: high contrast for cataracts, warm colors for light sensitivity, or colors for each kind of color blindness.',
  tools:
    'Each tool has settings of its own: how often matches blink, and how fast, how much the spotlight dims, how slow and thick the ring is, and how big the magnifier’s text is.',
  overview:
    'And there’s more in the settings: how it opens, the find bar’s size, theme and place on the screen, your own shortcuts, the voice and its speed, and backups to keep or share your profiles.',
  limits:
    'A few pages are off limits to every extension, like the browser’s own pages, the Chrome Web Store, and PDFs. There, Accessible Find tells you why, and how to use the browser’s own find instead.',
  privacy:
    'Nothing is collected or sent anywhere: your searches stay on your device. Read aloud uses your browser’s voices, and the settings point out the online ones, which send the text to its speech service.',
  end: 'Accessible Find is free and open source. Get it on the Chrome Web Store, or on Firefox Add-ons.',
};

/** What Accessible Find reads aloud in the video, word for word (the test checks it). */
const READ = {
  match: 'Today the lighthouse is automated, but the view from the cape is unchanged.',
  selection: 'Visitors often ask why the lighthouse sits so far back from the edge.',
  pasted: 'Bring a warm jacket: the wind at the cape is strong, even in summer.',
  anywhere: 'The keepers who lived here climbed its stairs every evening to light the lamp.',
};

/** The article as a dark website shows it, with room below so its last match can sit mid-screen. */
const DARK_ARTICLE =
  'body{background:#14161b;color:#d9dde6} header{background:#05070c} .meta{color:#9aa3b5} main{padding-bottom:50vh}' +
  ' ::selection{background:#3a64c8;color:#fff}';
/** The ring, slower and thicker than by default, so it shows in the video (both are settings). */
const RING = { ping: { enabled: true, durationMs: 1500, width: 8 } };
/** What's left of the screen with a narrow field of view, in page pixels. */
const TUNNEL = 150;
/** The narrow field of view at full strength (how dark that leaves the rest is in compose.ts). */
const VEIL = 1;

const test = base.extend({
  // The screencast sends device pixels only when Chrome itself is scaled.
  context: async ({}, use) => {
    const context = await launch({
      headless: true,
      viewport: null,
      args: [`--force-device-scale-factor=${SCALE}`, `--window-size=${VIEW.width},${VIEW.height}`, '--hide-scrollbars'],
    });
    await use(context);
    await context.close();
  },
});
test.skip(!OUT, 'Set STORE_VIDEO=<dir> to record the demo video');

/** Sizes the window so the page inside it is VIEW (to a pixel: scaling rounds). */
async function fitWindow(page: Page): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  // The window takes a moment to resize, more so on a busy computer.
  for (let i = 0; i < 8; i++) {
    const { windowId, bounds } = await cdp.send('Browser.getWindowForTarget');
    const inner = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
    if (inner.width === VIEW.width && inner.height === VIEW.height) break;
    await cdp.send('Browser.setWindowBounds', {
      windowId,
      bounds: { width: bounds.width! + VIEW.width - inner.width, height: bounds.height! + VIEW.height - inner.height },
    });
    await sleep(150);
  }
  await cdp.detach();
  const inner = await page.evaluate(() => [innerWidth, innerHeight]);
  expect(Math.abs(inner[0]! - VIEW.width) + Math.abs(inner[1]! - VIEW.height)).toBeLessThanOrEqual(1);
}

/** What the e2e build would have said aloud so far. */
const spoken = (sw: Worker) =>
  sw.evaluate(() => (globalThis as unknown as { __e2e: { spoken: string[] } }).__e2e.spoken.slice());

/** The browser shortcut for reading aloud without the find bar ('' when unset). */
const readAloudShortcut = (sw: Worker) =>
  sw.evaluate(async () => (await chrome.commands.getAll()).find((c) => c.name === 'read_aloud')?.shortcut ?? '');

/**
 * Finds `text` on the page and brings it mid-screen, clear of the subtitles, ready for
 * dragSelect. Returns where it is, in CSS pixels.
 */
async function findText(page: Page, text: string): Promise<Box> {
  return page.evaluate(async (text) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const start = node.textContent!.indexOf(text);
      if (start < 0) continue;
      Object.assign(window, { demoSelection: { node, start, end: start + text.length } });
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, start + text.length);
      const { top, bottom } = range.getBoundingClientRect();
      if (top < 90 || bottom > innerHeight * 0.72) {
        scrollBy({ top: (top + bottom) / 2 - innerHeight * 0.45, behavior: 'smooth' });
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
      const box = range.getBoundingClientRect();
      return { x: box.left, y: box.top, width: box.width, height: box.height };
    }
    throw new Error(`No “${text}” on the page`);
  }, text);
}

/** Selects the text findText found the way a hand would, dragging the pointer from its start to its end. */
async function dragSelect(page: Page): Promise<void> {
  const from = await page.evaluate(() => {
    const { node, start } = (window as unknown as { demoSelection: { node: Node; start: number } }).demoSelection;
    const caret = document.createRange();
    caret.setStart(node, start);
    const box = caret.getBoundingClientRect();
    return { x: box.left, y: box.top + box.height / 2 };
  });
  await pointTo(page, from);
  await page.evaluate(async () => {
    const { node, start, end } = (window as unknown as { demoSelection: { node: Node; start: number; end: number } })
      .demoSelection;
    const pointer = document.getElementById('demo-pointer')!;
    pointer.style.transition = 'opacity 200ms';
    for (let k = start; ; k = Math.min(end, k + 3)) {
      getSelection()!.setBaseAndExtent(node, start, node, k);
      const caret = document.createRange();
      caret.setStart(node, k);
      const box = caret.getBoundingClientRect();
      pointer.style.transform = `translate(${box.left - 3}px, ${box.top + box.height / 2 - 2}px)`;
      await new Promise((resolve) => setTimeout(resolve, 30));
      if (k === end) break;
    }
  });
}

test('demo video', async ({ context, page, sw }) => {
  test.setTimeout(30 * 60_000);
  // Absolute: the compositor reads frames by name from here.
  const work = path.resolve(OUT!, '.video');
  await rm(work, { recursive: true, force: true });
  await mkdir(work, { recursive: true });

  // The narration first: each line's length sets the pace of its scene. Kept between runs.
  const voices = path.join(os.homedir(), '.cache', 'accessible-find', 'narration');
  await mkdir(voices, { recursive: true });
  const say = {} as Record<keyof typeof SCRIPT, Line>;
  for (const [key, text] of Object.entries(SCRIPT)) say[key as keyof typeof SCRIPT] = await narrate(text, voices);
  const heard = {} as Record<keyof typeof READ, Line>;
  for (const [key, text] of Object.entries(READ)) heard[key as keyof typeof READ] = await narrate(text, voices, READER_VOICE);
  // Headless Chrome has no voices, so reading would end at once: the e2e build pretends to read
  // each of these for as long as its voice in the video, and the find bar shows Stop meanwhile.
  const pretend = Object.fromEntries(Object.entries(READ).map(([key, text]) => [text, heard[key as keyof typeof READ].seconds]));
  await sw.evaluate(([key, value]) => chrome.storage.local.set({ [key]: value }), [E2E_PRETEND_SPEECH_KEY, pretend] as const);
  const id = new URL(sw.url()).host;

  const rec = new Recorder(work);
  await setPrefs(sw, { theme: 'dark', uiScale: 1.25, barPosition: 'top-right' });
  await setEffects(sw, RING);
  await goto(page, 'article.html');
  await page.addStyleTag({ content: DARK_ARTICLE });
  await fitWindow(page);
  await rec.watch(page);

  let bar!: Frame;
  const input = () => bar.getByRole('textbox', { name: 'Find in page' });
  const press = async (key: string, label: string) => {
    rec.key(label);
    await input().press(key);
  };
  const click = async (target: ReturnType<Frame['getByRole']>) => {
    await pointAt(bar, target);
    await target.click();
  };
  /** Plays what Accessible Find reads aloud, once the e2e build says it really read `text`. */
  const hear = async (line: Line, text: string) => {
    const reading = rec.say(line);
    await expect.poll(() => spoken(sw)).toContain(text);
    await reading;
  };

  await rec.film('narrow field of view', async () => {
    const lineDone = rec.say(say.narrow);
    await sleep(800);
    rec.mask({ x: 640, y: 380, r: TUNNEL, a: VEIL }, 2.6);
    await lineDone;
    const lost = rec.say(say.lost);
    rec.mask({ x: 430, y: 250, r: TUNNEL, a: VEIL }, 1.8);
    await sleep(2000);
    rec.mask({ x: 860, y: 470, r: TUNNEL, a: VEIL }, 1.8);
    await lost;
    const made = rec.say(say.made);
    rec.mask(NO_MASK, 1.8);
    await made;
  });

  await rec.film('type', async () => {
    const lineDone = rec.say(say.press);
    await sleep(500);
    rec.key('Ctrl+F');
    await openViaCommand(sw, page);
    bar = await findBar(page);
    rec.frame(await frameBox(bar), 1.6);
    await sleep(1000);
    await input().pressSequentially('lighthouse', { delay: 140 });
    await lineDone;
    rec.camera(WHOLE_PAGE, 1.1);
    await rec.say(say.lit);
  });

  await rec.film('ring', async () => {
    const lineDone = rec.say(say.ring);
    await sleep(900);
    // On the whole screen first, where the ring is easy to follow.
    await press('Enter', 'Enter');
    await sleep(2300);
    // Then with a narrow field of view: the ring crosses it on its way to the match.
    rec.mask({ x: 640, y: 380, r: TUNNEL + 20, a: VEIL }, 0.9);
    await sleep(1100);
    await press('Enter', 'Enter');
    await sleep(1000);
    const match = await currentMatch(page);
    if (match) rec.mask({ ...centerOf(match), r: TUNNEL + 20, a: VEIL }, 0.9);
    await sleep(1800);
    await lineDone;
    rec.mask(NO_MASK, 1);
    // The match up to the middle of the screen, so the magnifier has room below it, clear of the subtitles.
    const last = await currentMatch(page);
    if (last) await page.evaluate((y) => scrollBy({ top: y - innerHeight * 0.45, behavior: 'smooth' }), centerOf(last).y);
    await sleep(1000);
  });

  await rec.film('effects', async () => {
    const lineDone = rec.say(say.help);
    await sleep(600);
    await click(bar.getByRole('button', { name: 'Quick settings' }));
    await sleep(400);
    rec.frame(await frameBox(bar), 1.45);
    await sleep(1600);
    for (const name of ['Guide lines', 'Spotlight']) {
      await click(bar.getByRole('switch', { name }));
      await sleep(1500);
    }
    // The magnifier opens beside the match, away from the panel: pull back as it does.
    await click(bar.getByRole('switch', { name: 'Magnifier' }));
    rec.camera(WHOLE_PAGE, 1.1);
    await sleep(1500);
    await click(bar.getByRole('button', { name: 'Quick settings' }));
    await hidePointer(bar);
    await lineDone;
    // A guide line reaches into a narrow view, and leads it to the match.
    const match = centerOf((await currentMatch(page))!);
    const follow = rec.say(say.follow);
    rec.mask({ x: 110, y: match.y, r: TUNNEL, a: VEIL }, 0.9);
    await sleep(1300);
    rec.mask({ ...match, r: TUNNEL, a: VEIL }, 2.2);
    await follow;
    await sleep(800);
    rec.mask(NO_MASK, 0.9);
    await sleep(1000);
  });

  await setEffects(sw, RING);
  await sleep(800);
  await rec.film('list', async () => {
    const lineDone = rec.say(say.list);
    await sleep(400);
    await press('Alt+l', 'Alt+L');
    await sleep(500);
    rec.frame(await frameBox(bar), 1.35);
    await sleep(2000);
    for (let i = 0; i < 2; i++) {
      await press('ArrowUp', '↑');
      await sleep(1400);
    }
    await lineDone;
    await press('Alt+l', 'Alt+L');
    rec.camera(WHOLE_PAGE, 0.9);
    await sleep(1000);
  });

  // Reading aloud, 1: the sentence around the current match.
  await rec.film('read match', async () => {
    const lineDone = rec.say(say.readMatch);
    const speaker = bar.getByRole('button', { name: /^Read aloud/ });
    rec.frame(await frameBox(bar), 1.6);
    await sleep(500);
    await pointAt(bar, speaker);
    await lineDone;
    await speaker.click();
    rec.camera(WHOLE_PAGE, 1);
    await hear(heard.match, READ.match);
    await hidePointer(bar);
  });

  // 2: text selected on the page, with Ctrl+F (the every-site hotkey takes the selection).
  await rec.film('read selection', async () => {
    await press('Escape', 'Esc');
    await sleep(600);
    const lineDone = rec.say(say.readSelection);
    const sentence = await findText(page, READ.selection);
    rec.frame({ x: sentence.x - 40, y: sentence.y - 60, width: sentence.width + 80, height: sentence.height + 120 }, 1.5);
    await sleep(700);
    await dragSelect(page);
    await hidePointer(page);
    rec.key('Ctrl+F');
    await page.keyboard.press('Control+f');
    bar = await findBar(page);
    await expect(input()).toHaveValue(READ.selection);
    rec.camera(WHOLE_PAGE, 0.9);
    // The voice reads once the narrator is done.
    await lineDone;
    await press('Alt+r', 'Alt+R');
    await hear(heard.selection, READ.selection);
  });

  // 3: anyone's own text, pasted into the find bar.
  await rec.film('read pasted', async () => {
    const lineDone = rec.say(say.readPasted);
    rec.frame(await frameBox(bar), 1.6);
    await sleep(900);
    await input().selectText();
    rec.key('Ctrl+V');
    await page.keyboard.insertText(READ.pasted);
    await lineDone;
    await press('Alt+r', 'Alt+R');
    await hear(heard.pasted, READ.pasted);
  });

  // 4: a shortcut for reading without the find bar, set from the settings. It starts unset,
  // as when Chrome couldn't give it Alt+R.
  await input().press('Escape');
  await page.evaluate(() => getSelection()?.removeAllRanges());
  const unset = await context.newPage();
  await unset.goto('chrome://extensions/shortcuts');
  await unset.getByRole('button', { name: /Read aloud the selected text/ }).filter({ visible: true }).first().click();
  await unset.keyboard.press('Backspace');
  await expect.poll(() => readAloudShortcut(sw)).toBe('');
  await unset.close();
  const readSettings = await context.newPage();
  await readSettings.goto(`chrome-extension://${id}/options.html#read-aloud`);
  await fitWindow(readSettings);
  await rec.watch(readSettings);
  let chromeShortcuts!: Page;
  await rec.film('shortcut settings', async () => {
    const lineDone = rec.say(say.shortcut);
    const choose = readSettings.getByRole('button', { name: 'Choose a shortcut' });
    const heading = readSettings.getByRole('heading', { name: 'Without the find bar' });
    // The page first, then its card for reading without the find bar, up from below the fold.
    await sleep(800);
    await heading.evaluate((el) => {
      const r = (el.closest('[data-slot=card]') ?? el).getBoundingClientRect();
      scrollBy({ top: r.top + r.height / 2 - innerHeight * 0.42, behavior: 'smooth' });
    });
    await sleep(900);
    const card = (await heading.boundingBox())!;
    const button = (await choose.boundingBox())!;
    rec.frame({ x: card.x - 30, y: card.y - 30, width: 760, height: button.y + button.height + 30 - (card.y - 30) }, 1.5);
    await sleep(900);
    await pointAt(readSettings, choose);
    await lineDone;
    const opened = context.waitForEvent('page');
    await choose.click();
    chromeShortcuts = await opened;
  });
  await chromeShortcuts.emulateMedia({ colorScheme: 'dark' });
  await chromeShortcuts.waitForLoadState();
  await fitWindow(chromeShortcuts);
  await rec.watch(chromeShortcuts);
  await rec.film('shortcut page', async () => {
    const lineDone = rec.say(say.shortcutPage);
    const visible = (text: string) => chromeShortcuts.getByText(text, { exact: true }).filter({ visible: true }).first();
    const name = (await visible('Accessible Find in Page').boundingBox())!;
    const row = (await visible('Read aloud the selected text').boundingBox())!;
    rec.frame({ x: name.x - 60, y: name.y - 26, width: 680, height: row.y + row.height + 30 - (name.y - 26) }, 1.6);
    await sleep(900);
    const edit = chromeShortcuts.getByRole('button', { name: /Read aloud the selected text/ }).filter({ visible: true }).first();
    await pointAt(chromeShortcuts, edit);
    await edit.click();
    await sleep(600);
    rec.key('Alt+R');
    await chromeShortcuts.keyboard.press('Alt+r');
    await expect.poll(() => readAloudShortcut(sw)).toBe('Alt+R');
    await hidePointer(chromeShortcuts);
    await lineDone;
    await sleep(600);
  });

  // 5: and then on any page, with the find bar closed.
  await rec.watch(page);
  await rec.film('read anywhere', async () => {
    const lineDone = rec.say(say.readAnywhere);
    const sentence = await findText(page, READ.anywhere);
    rec.frame({ x: sentence.x - 40, y: sentence.y - 60, width: sentence.width + 80, height: sentence.height + 120 }, 1.5);
    await sleep(700);
    await dragSelect(page);
    await lineDone;
    rec.key('Alt+R');
    await readViaCommand(sw);
    await hear(heard.anywhere, READ.anywhere);
    await hidePointer(page);
    await page.evaluate(() => getSelection()?.removeAllRanges());
    await sleep(400);
  });

  // The same article, as a light website shows it.
  await goto(page, 'article.html');
  await rec.watch(page);
  await rec.film('light', async () => {
    await openViaCommand(sw, page);
    bar = await findBar(page);
    await sleep(500);
    const lineDone = rec.say(say.light);
    await input().pressSequentially('cliff', { delay: 140 });
    await sleep(900);
    const match = await currentMatch(page);
    if (match) rec.frame({ x: match.x - 220, y: match.y - 120, width: match.width + 440, height: match.height + 240 }, 1.5, 1.2);
    await lineDone;
    await sleep(1400);
    rec.camera(WHOLE_PAGE, 0.9);
    await sleep(1000);
  });

  const settings = await context.newPage();
  await settings.goto(`chrome-extension://${id}/options.html#appearance`);
  await fitWindow(settings);
  await rec.watch(settings);
  await rec.film('profiles', async () => {
    const lineDone = rec.say(say.profiles);
    await sleep(700);
    const profile = settings.getByRole('combobox', { name: 'Profile' });
    // The profile card at the top of the window: the camera can't zoom out, and the samples
    // must stay clear of the subtitles.
    await profile.evaluate((el) => scrollBy({ top: el.getBoundingClientRect().top - 53, behavior: 'smooth' }));
    await sleep(900);
    await pointAt(settings, profile);
    const [first, ...others] = [
      'High contrast, inverted (cataracts)',
      'Light sensitivity',
      'Red-green color blindness',
      'No color vision (achromatopsia)',
    ];
    await profile.selectOption({ label: first });
    // The profile, and both sample pages under it, measured with a built-in's description in between.
    const top = (await profile.boundingBox())!;
    const lightPage = (await settings.getByRole('img', { name: 'How matches look on light pages' }).boundingBox())!;
    const darkPage = (await settings.getByRole('img', { name: 'How matches look on dark pages' }).boundingBox())!;
    rec.frame(
      { x: lightPage.x, y: top.y, width: darkPage.x + darkPage.width - lightPage.x, height: darkPage.y + darkPage.height - top.y },
      1.4,
    );
    await sleep(2100);
    for (const label of others) {
      await profile.selectOption({ label });
      await sleep(2100);
    }
    await lineDone;
    await profile.selectOption('default');
    await hidePointer(settings);
    rec.camera(WHOLE_PAGE, 0.9);
    await sleep(1000);
  });

  // Each tool's own settings, under the profile's colors.
  await rec.film('tool settings', async () => {
    const lineDone = rec.say(say.tools);
    await settings
      .getByRole('heading', { name: 'Underline, border and blinking' })
      .evaluate((el) => scrollBy({ top: el.getBoundingClientRect().top - 80, behavior: 'smooth' }));
    await sleep(2600);
    for (const [name, then] of [
      ['Spotlight', 1700],
      ['Magnifier', 1500],
    ] as const) {
      const toggle = settings.getByRole('switch', { name, exact: true });
      // Clear of the subtitles.
      await toggle.evaluate((el) => {
        const { bottom } = el.getBoundingClientRect();
        if (bottom > innerHeight * 0.55) scrollBy({ top: bottom - innerHeight * 0.4, behavior: 'smooth' });
      });
      await sleep(700);
      await pointAt(settings, toggle);
      await toggle.click();
      await sleep(then);
      if (name === 'Spotlight') {
        await pointAt(settings, settings.getByRole('slider', { name: 'Ring duration' }));
        await sleep(1500);
      }
    }
    await lineDone;
    await hidePointer(settings);
    await sleep(400);
  });

  // A quick tour of the other settings pages, in step with the line.
  await rec.film('settings overview', async () => {
    const lineDone = rec.say(say.overview);
    await settings.evaluate(() => scrollTo({ top: 0, behavior: 'smooth' }));
    await sleep(500);
    for (const name of ['Opening it', 'Find bar', 'Shortcuts', 'Read aloud', 'Backup']) {
      const link = settings.getByRole('link', { name, exact: true });
      await pointAt(settings, link);
      await link.click();
      await sleep(1500);
    }
    await lineDone;
    await hidePointer(settings);
    await sleep(500);
  });

  // A browser page, where no extension may run, with the popup Accessible Find shows there.
  // Headless Chrome has no toolbar to open the popup from, so the scene is put together from
  // pictures of both.
  const browserPage = await context.newPage();
  await browserPage.emulateMedia({ colorScheme: 'dark' });
  await browserPage.goto('chrome://settings');
  await fitWindow(browserPage);
  await sleep(800);
  const backdrop = await browserPage.screenshot();
  await browserPage.close();
  const popupPage = await context.newPage();
  await popupPage.setViewportSize({ width: 440, height: 600 });
  await popupPage.goto(`chrome-extension://${id}/unavailable.html?reason=browser-page`);
  await expect(popupPage.getByRole('heading', { level: 1 })).toBeVisible();
  await sleep(500);
  const popupBox = (await popupPage.locator('main').boundingBox())!;
  const popup = await popupPage.locator('main').screenshot();
  await popupPage.close();
  const stage = await context.newPage();
  await stage.setContent(
    `<body style="margin:0;background:#202124;overflow:hidden">
      <img src="data:image/png;base64,${backdrop.toString('base64')}" style="display:block;width:${VIEW.width}px;height:${VIEW.height}px">
      <img id="popup" src="data:image/png;base64,${popup.toString('base64')}" style="position:fixed;top:10px;right:14px;
        width:${popupBox.width}px;border-radius:10px;box-shadow:0 14px 44px rgba(0,0,0,0.65),0 0 0 1px rgba(255,255,255,0.14);
        opacity:0;transform:translateY(-10px);transition:opacity 240ms,transform 240ms">
    </body>`,
  );
  await fitWindow(stage);
  await rec.watch(stage);
  await rec.film('limits', async () => {
    const lineDone = rec.say(say.limits);
    await sleep(1800);
    await stage.evaluate(() => {
      const popup = document.getElementById('popup')!;
      popup.style.opacity = '1';
      popup.style.transform = 'none';
    });
    await sleep(500);
    rec.frame({ x: VIEW.width - 14 - popupBox.width, y: 10, width: popupBox.width, height: popupBox.height }, 1.6);
    await lineDone;
    await sleep(900);
  });
  await rec.done();

  const icon = await dataUrl('assets/brand/icon.svg', 'image/svg+xml');
  await compose(
    rec,
    {
      line: say.title,
      seconds: 4,
      html: `<img src="${icon}" style="width:190px;height:190px;border-radius:42px;${ICON_EDGE}">
        <h1 style="margin:48px 0 0;font-size:104px;font-weight:750;letter-spacing:-0.015em;color:#F4F6FC">Accessible Find</h1>
        <p style="margin:22px 0 0;font-size:52px;color:#C9D2EA">${marked('Find in page, made *visible*.')}</p>`,
    },
    {
      line: say.end,
      seconds: 5,
      html: `<div style="display:flex;align-items:center;gap:36px">
          <img src="${icon}" style="width:150px;height:150px;border-radius:33px;${ICON_EDGE}">
          <h1 style="margin:0;font-size:96px;font-weight:750;letter-spacing:-0.015em;color:#F4F6FC">Accessible Find</h1>
        </div>
        <p style="margin:44px 0 0;font-size:56px;color:#C9D2EA">${marked('Find in page, made *visible*.')}</p>
        <p style="margin:56px 0 0;font-size:46px;font-weight:650;color:#F4F6FC">Free and open source, for Chrome and Firefox.</p>`,
    },
    work,
    path.join(OUT!, 'demo.mp4'),
    [
      {
        after: 'limits',
        card: {
          line: say.privacy,
          seconds: 4,
          html: `<div style="display:flex;align-items:center;gap:30px">
              <svg width="96" height="96" viewBox="0 0 24 24" fill="none" stroke="#FFD60A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>
              </svg>
              <h1 style="margin:0;font-size:88px;font-weight:750;letter-spacing:-0.015em;color:#F4F6FC">Private by design</h1>
            </div>
            <ul style="margin:56px 0 0;padding:0;list-style:none;font-size:44px;line-height:1.5;color:#C9D2EA;text-align:left">
              <li>Nothing is collected or sent anywhere.</li>
              <li>Your searches stay on your device.</li>
              <li>Read aloud: the settings point out ${marked('*online*')} voices.</li>
            </ul>`,
        },
      },
    ],
  );
  await rm(work, { recursive: true, force: true });
});
