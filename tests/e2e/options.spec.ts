import { expect, test } from './harness';

test('settings page renders, edits settings and stays free of errors', async ({ context, sw }) => {
  const errors: string[] = [];
  const page = await context.newPage();
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  const id = new URL(sw.url()).host;
  await page.goto(`chrome-extension://${id}/options.html#welcome`);

  await expect(page.getByRole('heading', { name: 'Welcome to Accessible Find' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Opening Accessible Find' })).toBeVisible();
  // The e2e build has every-site access pre-granted.
  await expect(page.getByRole('switch', { name: /on every website/ })).toBeChecked();

  // One page at a time: the navigation says which one is showing, and focus moves to it.
  const nav = page.getByRole('navigation', { name: 'Settings pages' });
  await nav.getByRole('link', { name: 'Find bar' }).click();
  await expect(page.getByRole('heading', { name: 'Find bar', level: 2 })).toBeFocused();
  await expect(nav.getByRole('link', { name: 'Find bar' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('heading', { name: 'Opening Accessible Find' })).toHaveCount(0);

  // Theme: choosing Light removes the dark class right away.
  await page.getByRole('radio', { name: 'Light' }).check();
  await expect(page.locator('html')).not.toHaveClass(/dark/);

  // Text size scales the whole page.
  const slider = page.getByRole('slider', { name: 'Text size', exact: true });
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('html')).toHaveCSS('font-size', '24px');

  // Editing a color saves it to storage.
  await nav.getByRole('link', { name: 'Highlight style' }).click();
  const hex = page.getByRole('textbox', { name: 'Background (hex code)' }).first();
  await hex.fill('#123456');
  await hex.press('Enter');
  await expect
    .poll(() =>
      sw.evaluate(async () => {
        const all = await chrome.storage.sync.get(null);
        return (all[`profile:${all.activeProfileId}`] as { appearance: { matchBg: string } } | undefined)?.appearance
          .matchBg;
      }),
    )
    .toBe('#123456');

  // Built-in profiles can be changed too: the change is kept, and they reset to how they came.
  await page.getByRole('combobox', { name: 'Profile' }).selectOption({ label: 'High contrast, inverted (cataracts)' });
  const builtInHex = page.getByRole('textbox', { name: 'Background (hex code)' }).first();
  await expect(builtInHex).toHaveValue('#000000');
  await expect(page.getByRole('button', { name: 'Reset to original' })).toHaveCount(0);
  await builtInHex.fill('#abcdef');
  await builtInHex.press('Enter');
  const storedBuiltIn = () =>
    sw.evaluate(async () => {
      const stored = (await chrome.storage.sync.get('profile:sys-hc-light'))['profile:sys-hc-light'];
      return (stored as { appearance: { matchBg: string } } | undefined)?.appearance.matchBg ?? null;
    });
  await expect.poll(storedBuiltIn).toBe('#abcdef');
  await page.getByRole('button', { name: 'Reset to original' }).click();
  await expect(builtInHex).toHaveValue('#000000');
  await expect.poll(storedBuiltIn).toBeNull();
  await expect(page.getByRole('button', { name: 'Reset to original' })).toHaveCount(0);

  expect(errors).toEqual([]);
});

test('no settings page shows a disabled control', async ({ context, sw }) => {
  const page = await context.newPage();
  const id = new URL(sw.url()).host;
  for (const hash of ['activation', 'appearance', 'display', 'shortcuts', 'read-aloud', 'backup']) {
    await page.goto(`chrome-extension://${id}/options.html#${hash}`);
    await expect(page.locator(`#${hash}-title`)).toBeVisible();
    await expect(page.locator(':disabled, [aria-disabled="true"], [data-disabled]'), hash).toHaveCount(0);
  }
  // Built-in profiles are fully editable as well.
  await page.goto(`chrome-extension://${id}/options.html#appearance`);
  await page.getByRole('combobox', { name: 'Profile' }).selectOption({ label: 'Red-green color blindness' });
  await expect(page.getByRole('textbox', { name: 'Background (hex code)' }).first()).toBeEditable();
  await expect(page.locator(':disabled, [aria-disabled="true"], [data-disabled]')).toHaveCount(0);
});

test('extension pages use the brand font at the chosen text size', async ({ context, sw }) => {
  // Chrome styles extension pages with a smaller system font; ours must win.
  const id = new URL(sw.url()).host;
  const page = await context.newPage();
  for (const name of ['options.html', 'practice.html', 'findbar.html', 'unavailable.html']) {
    await page.goto(`chrome-extension://${id}/${name}`);
    const body = await page.evaluate(() => {
      const style = getComputedStyle(document.body);
      return { family: style.fontFamily, size: style.fontSize, root: getComputedStyle(document.documentElement).fontSize };
    });
    expect(body.family, name).toMatch(/^"?Atkinson Hyperlegible Next/);
    expect(body.size, name).toBe(body.root);
  }
});

test('with large text the settings navigation moves above the page', async ({ context, sw }) => {
  await sw.evaluate(() => chrome.storage.sync.set({ schemaVersion: 2, prefs: { uiScale: 2.5 } }));
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`chrome-extension://${new URL(sw.url()).host}/options.html#display`);
  await expect(page.locator('html')).toHaveCSS('font-size', '40px');
  const nav = await page.getByRole('navigation', { name: 'Settings pages' }).boundingBox();
  const title = await page.getByRole('heading', { name: 'Find bar', level: 2 }).boundingBox();
  // A sidebar would leave the page a narrow column; above it, the page gets the full width.
  expect(nav!.y + nav!.height).toBeLessThanOrEqual(title!.y);
  expect(title!.x).toBeLessThan(100);
});

test('an effect’s help button shows an example of it, beside the field', async ({ context, sw }) => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`chrome-extension://${new URL(sw.url()).host}/options.html#appearance`);
  const card = page.locator('[data-slot=hover-card-content]');
  // Only the help button shows it, not the rest of the field.
  await page.getByText('Spotlight', { exact: true }).hover();
  await page.waitForTimeout(800);
  await expect(card).toHaveCount(0);
  await page.getByRole('button', { name: 'Example: Spotlight' }).hover();
  await expect(card).toContainText('Everything but the current match is dimmed');
  // Beside the field: never over its own switch, or the ones under it.
  const box = (await card.boundingBox())!;
  for (const name of ['Spotlight', 'Ring']) {
    const s = (await page.getByRole('switch', { name }).boundingBox())!;
    const apart = box.x + box.width <= s.x || s.x + s.width <= box.x || box.y + box.height <= s.y || s.y + s.height <= box.y;
    expect(apart).toBe(true);
  }
  // It lets the pointer through, so moving on over it closes it.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect(card).toHaveCount(0);

  // A click (or tap) shows it too.
  await page.getByRole('button', { name: 'Example: Ring' }).click();
  await expect(card).toContainText('a ring shrinks');
  await page.mouse.move(0, 0);
  await expect(card).toHaveCount(0);

  // From the keyboard: focusing the help button shows it, and Escape hides it.
  await page.getByRole('button', { name: 'Example: Guide lines' }).focus();
  await expect(card).toContainText('Lines across the whole screen');
  await page.keyboard.press('Escape');
  await expect(card).toHaveCount(0);

  // With motion turned off, the moving examples hold still and say why.
  await sw.evaluate(() => chrome.storage.sync.set({ schemaVersion: 2, prefs: { motion: 'reduce' } }));
  await page.getByRole('button', { name: 'Example: Blink' }).hover();
  await expect(card).toContainText('This doesn’t happen while blinking and animation are turned off.');
});

test('online voices are marked, since they send the text away to be spoken', async ({ context, sw }) => {
  const page = await context.newPage();
  // Headless Chrome has no voices: give it one on the device and one online, as Chrome has.
  await page.addInitScript(() => {
    const voice = (name: string, localService: boolean) => ({ name, lang: 'en-US', voiceURI: name, localService, default: false });
    const voices = [voice('Local English', true), voice('Google US English', false)];
    Object.defineProperty(speechSynthesis, 'getVoices', { value: () => voices });
  });
  await page.goto(`chrome-extension://${new URL(sw.url()).host}/options.html#read-aloud`);
  const select = page.getByRole('combobox', { name: 'Voice' });
  await expect(select.locator('option')).toHaveText([
    'Automatic, in the page’s language',
    'Google US English (en-US, online)',
    'Local English (en-US)',
  ]);
  await expect(select).toHaveAccessibleDescription(
    'Online voices send what’s read to your browser’s speech service. The others work on this device. Automatic may use either.',
  );
});

test('with only online voices, as Chrome has on Linux, Automatic is said to be online too', async ({ context, sw }) => {
  const page = await context.newPage();
  await page.addInitScript(() => {
    const voices = [{ name: 'Google US English', lang: 'en-US', voiceURI: 'g', localService: false, default: true }];
    Object.defineProperty(speechSynthesis, 'getVoices', { value: () => voices });
  });
  await page.goto(`chrome-extension://${new URL(sw.url()).host}/options.html#read-aloud`);
  await expect(page.getByRole('combobox', { name: 'Voice' })).toHaveAccessibleDescription(
    /This browser has no voices on the device, so Automatic is online too\./,
  );
});

test('each profile’s colors sit beside how they look, on light and on dark pages', async ({ context, sw }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${new URL(sw.url()).host}/options.html#appearance`);
  const light = page.getByRole('region', { name: 'On light pages' });
  const dark = page.getByRole('region', { name: 'On dark pages' });
  // Each with its sample page and its own colors.
  await expect(light.getByRole('img', { name: 'How matches look on light pages' })).toBeVisible();
  await expect(dark.getByRole('img', { name: 'How matches look on dark pages' })).toBeVisible();
  await expect(light.getByRole('textbox', { name: 'Background (hex code)' }).first()).toHaveValue('#ffd60a');
  const hex = dark.getByRole('region', { name: 'All matches' }).getByRole('textbox', { name: 'Background (hex code)' });
  await hex.fill('#336699');
  await hex.press('Enter');
  await expect
    .poll(() =>
      sw.evaluate(async () => {
        const stored = (await chrome.storage.sync.get('profile:default'))['profile:default'];
        return (stored as { appearance: { dark: { matchBg: string } } } | undefined)?.appearance.dark.matchBg;
      }),
    )
    .toBe('#336699');
  // With automatic style off, dark pages use the light-page colors, and the dark ones are put away.
  await dark.getByRole('switch', { name: 'Automatic style' }).click();
  await expect(dark.getByRole('region', { name: 'All matches' })).toHaveCount(0);
  await expect(dark.getByText('Off: matches on a dark background use the colors for light pages.')).toBeVisible();
  await expect
    .poll(() => sw.evaluate(async () => ((await chrome.storage.sync.get('prefs')).prefs as { autoProfile: { enabled: boolean } }).autoProfile.enabled))
    .toBe(false);
});

test('a new profile starts from the default style, ready to be named', async ({ context, sw }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${new URL(sw.url()).host}/options.html#appearance`);
  // From a built-in one, to show it doesn't copy it.
  await page.getByRole('combobox', { name: 'Profile' }).selectOption({ label: 'Red-green color blindness' });
  await page.getByRole('button', { name: 'New profile' }).click();
  const name = page.getByRole('textbox', { name: 'Profile name' });
  await expect(name).toBeFocused();
  await expect(name).toHaveValue('New profile');
  await name.fill('My colors');
  await name.press('Enter');
  await expect(page.getByRole('combobox', { name: 'Profile' })).toHaveValue(/.+/);
  await expect(page.getByRole('combobox', { name: 'Profile' }).locator('option:checked')).toHaveText('My colors');
  await expect(
    page.getByRole('region', { name: 'On light pages' }).getByRole('textbox', { name: 'Background (hex code)' }).first(),
  ).toHaveValue('#ffd60a');
});

test('where it can’t run, the popup leads with the key for the browser’s own find', async ({ context, sw }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${new URL(sw.url()).host}/unavailable.html?reason=browser-page`);
  const heading = page.getByRole('heading', { level: 1 });
  await expect(heading).toHaveText(/^Press\s*Ctrl\s*F\s*to use the browser’s own find$/);
  await expect(heading).toBeFocused();
  await expect(page.getByRole('button', { name: 'Change shortcut' })).toHaveCount(0);

  // With Accessible Find's own shortcut on Ctrl+F, it took the first press; the next one is the browser's.
  await page.addInitScript(() => {
    const commands = [{ name: 'open_popup', shortcut: 'Ctrl+F', description: '' }];
    Object.defineProperty(chrome.commands, 'getAll', { value: async () => commands });
  });
  await page.reload();
  await expect(heading).toHaveText(/^Press\s*Ctrl\s*F\s*again to use the browser’s own find$/);
  await expect(page.getByText(/Your shortcut for Accessible Find is Ctrl\+F, so it takes the first press/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Change shortcut' })).toBeVisible();
});

test('the ring’s duration and thickness can be changed, and are only offered while the ring is on', async ({
  context,
  sw,
}) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${new URL(sw.url()).host}/options.html#appearance`);
  const duration = page.getByRole('slider', { name: 'Ring duration' });
  await expect(duration).toHaveAttribute('aria-valuenow', '750');
  await duration.focus();
  await page.keyboard.press('ArrowRight');
  await expect
    .poll(() =>
      sw.evaluate(async () => {
        const all = await chrome.storage.sync.get(null);
        return (all[`profile:${all.activeProfileId}`] as { appearance: { ping: { durationMs: number } } } | undefined)
          ?.appearance.ping.durationMs;
      }),
    )
    .toBe(800);
  const thickness = page.getByRole('slider', { name: 'Ring thickness' });
  await expect(thickness).toHaveAttribute('aria-valuenow', '4');
  await thickness.focus();
  await page.keyboard.press('ArrowRight');
  await expect
    .poll(() =>
      sw.evaluate(async () => {
        const all = await chrome.storage.sync.get(null);
        return (all[`profile:${all.activeProfileId}`] as { appearance: { ping: { width: number } } } | undefined)
          ?.appearance.ping.width;
      }),
    )
    .toBe(5);
  await page.getByRole('switch', { name: 'Ring', exact: true }).click();
  await expect(duration).toHaveCount(0);
  await expect(thickness).toHaveCount(0);
});
