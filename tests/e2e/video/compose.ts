/**
 * Turns a recording into the video. Each frame is drawn in a page (the recorded frame through
 * the camera, the narrow-field mask, keycaps, subtitles, title cards and crossfades) and piped
 * to ffmpeg; the narration is mixed in at the times it was spoken.
 */
import { chromium } from '@playwright/test';
import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import { promisify } from 'node:util';
import { brandCss } from '../store-art';
import type { Line } from './narration';
import { NO_MASK, VIEW, WHOLE_PAGE, type Camera, type Mask, type Move, type Recorder, type Scene, type Shot } from './recorder';

const exec = promisify(execFile);
const FPS = 30;
const OUT = { width: 1920, height: 1080 };
/** Crossfade between pieces, in seconds. */
const FADE = 0.5;
/** Least silence between the last line of a piece and the first of the next. */
const LINE_GAP = 0.8;
/** Output pixels per page pixel, with the camera all the way out. */
const K = OUT.width / VIEW.width;
/** Lucide's volume-2 icon, as a mask. */
const SPEAKER =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/>' +
      '<path d="M16 9a5 5 0 0 1 0 6"/><path d="M19.364 18.364a9 9 0 0 0 0-12.728"/></svg>',
  );
/** How long keycaps stay up after a key press. */
const KEY_SECONDS = 1.4;
/** Subtitles stay up this long after their line, and fade in and out over SUB_FADE. */
const SUB_HOLD = 0.25;
const SUB_FADE = 0.2;

export interface Card {
  html: string;
  line?: Line;
  /** At least this long; longer if the line needs it. */
  seconds: number;
}

interface Piece {
  start: number;
  seconds: number;
  scene?: Scene & { shots: Shot[] };
  card?: string;
  lines: { at: number; line: Line }[];
  keys: { at: number; label: string }[];
}

interface SlotState {
  opacity: number;
  card?: string;
  img?: string;
  transform?: string;
  mask?: string;
}
interface FrameState {
  slots: (SlotState | null)[];
  sub: string;
  subOpacity: number;
  /** The subtitle is Accessible Find reading aloud. */
  subReader: boolean;
  keys: string[];
  keysOpacity: number;
}

const ease = (p: number) => p * p * (3 - 2 * p);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Where a series of moves has got to at `t`; each starts from wherever the last one had got to. */
function at<T extends object>(moves: Move<T>[], initial: T, t: number): T {
  let state = initial;
  for (let i = 0; i < moves.length && moves[i]!.t <= t; i++) {
    const m = moves[i]!;
    const next = moves[i + 1];
    const until = next && next.t <= t ? next.t : t;
    const p = m.seconds > 0 ? ease(clamp((until - m.t) / m.seconds, 0, 1)) : 1;
    const mixed = { ...state } as Record<string, number>;
    for (const [k, v] of Object.entries(m.to as Record<string, number>)) {
      const from = (state as Record<string, number>)[k]!;
      mixed[k] = from + (v - from) * p;
    }
    state = mixed as T;
  }
  return state;
}

function lay(rec: Recorder, title: Card, end: Card): Piece[] {
  const card = (c: Card) => ({
    seconds: Math.max(c.seconds, (c.line?.seconds ?? 0) + 1.8),
    card: c.html,
    lines: c.line ? [{ at: 0.7, line: c.line }] : [],
    keys: [],
  });
  const list: Omit<Piece, 'start'>[] = [card(title)];
  for (const s of rec.scenes) {
    // What was on screen when the scene began, then every frame until it ended.
    const before = rec.shots.filter((x) => x.t <= s.from).at(-1);
    const shots = [...(before ? [before] : []), ...rec.shots.filter((x) => x.t > s.from && x.t <= s.to)];
    list.push({
      seconds: s.to - s.from,
      scene: { ...s, shots },
      lines: s.lines.map((l) => ({ at: l.t - s.from, line: l.line })),
      keys: s.keys.map((k) => ({ at: k.t - s.from, label: k.label })),
    });
  }
  list.push(card(end));
  const pieces: Piece[] = [];
  let lastLineEnd = -Infinity;
  for (const p of list) {
    const prev = pieces.at(-1);
    let start = prev ? prev.start + prev.seconds - FADE : 0;
    // Pieces overlap while they crossfade: hold the one before (on its last frame) until the
    // narration has had a pause, so one scene's first line never runs into the last scene's.
    const first = p.lines[0];
    const wait = prev && first ? lastLineEnd + LINE_GAP - (start + first.at) : 0;
    if (prev && wait > 0) {
      prev.seconds += wait;
      start += wait;
    }
    pieces.push({ ...p, start });
    for (const l of p.lines) lastLineEnd = Math.max(lastLineEnd, start + l.at + l.line.seconds);
  }
  return pieces;
}

function slot(piece: Piece, u: number, opacity: number): SlotState {
  if (piece.card !== undefined) return { opacity, card: piece.card };
  const s = piece.scene!;
  const t = s.from + clamp(u, 0, piece.seconds);
  let shot = s.shots[0]!;
  for (const x of s.shots) {
    if (x.t > t) break;
    shot = x;
  }
  const cam: Camera = at(s.camera, WHOLE_PAGE, t);
  const z = cam.zoom;
  const halfW = VIEW.width / (2 * z);
  const halfH = VIEW.height / (2 * z);
  const cx = clamp(cam.cx, halfW, VIEW.width - halfW);
  const cy = clamp(cam.cy, halfH, VIEW.height - halfH);
  const tx = OUT.width / 2 - cx * K * z;
  const ty = OUT.height / 2 - cy * K * z;
  const m: Mask = at(s.mask, NO_MASK, t);
  const x = OUT.width / 2 + (m.x - cx) * K * z;
  const y = OUT.height / 2 + (m.y - cy) * K * z;
  const r = m.r * K * z;
  // A faint rim around what's left in view, so the edge shows on dark pages too.
  const mask =
    m.a < 0.01
      ? 'none'
      : `radial-gradient(circle at ${x.toFixed(1)}px ${y.toFixed(1)}px, rgba(4,7,15,0) ${r.toFixed(1)}px, ` +
        `rgba(150,168,215,${(0.28 * m.a).toFixed(3)}) ${(r + 6 * z).toFixed(1)}px, ` +
        `rgba(4,7,15,${m.a.toFixed(3)}) ${(r + 70 * z).toFixed(1)}px)`;
  return {
    opacity,
    img: `https://video.local/${path.basename(shot.file)}`,
    transform: `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) scale(${z.toFixed(4)})`,
    mask,
  };
}

function stateAt(pieces: Piece[], tau: number): FrameState {
  const active = pieces.filter((p) => p.start <= tau && tau < p.start + p.seconds);
  const slots: (SlotState | null)[] = [null, null];
  // The later piece fades in over the earlier one.
  active.slice(-2).forEach((p, i, list) => {
    const fadeIn = list.length === 2 && i === 1 ? clamp((tau - p.start) / FADE, 0, 1) : 1;
    slots[i] = slot(p, tau - p.start, fadeIn);
  });
  const lines = pieces.flatMap((p) => p.lines.map((l) => ({ start: p.start + l.at, line: l.line })));
  const shown = lines.filter((l) => l.start <= tau && tau < l.start + l.line.seconds + SUB_HOLD).at(-1);
  const subEnd = shown ? shown.start + shown.line.seconds + SUB_HOLD : 0;
  const subOpacity = shown ? clamp(Math.min((tau - shown.start) / SUB_FADE, (subEnd - tau) / SUB_FADE), 0, 1) : 0;
  const keys = pieces.flatMap((p) => p.keys.map((k) => ({ start: p.start + k.at, label: k.label })));
  const key = keys.filter((k) => k.start <= tau && tau < k.start + KEY_SECONDS).at(-1);
  const keysOpacity = key ? clamp(Math.min((tau - key.start) / 0.15, (key.start + KEY_SECONDS - tau) / 0.25), 0, 1) : 0;
  return {
    slots,
    sub: shown?.line.text ?? '',
    subOpacity: Number(subOpacity.toFixed(2)),
    subReader: Boolean(shown?.line.reader),
    keys: key ? key.label.split('+') : [],
    keysOpacity: Number(keysOpacity.toFixed(2)),
  };
}

async function compositorHtml(): Promise<string> {
  return `<!doctype html><html><head><style>${await brandCss()}
    html, body { width: ${OUT.width}px; height: ${OUT.height}px; background: #0B1020; }
    .slot { position: absolute; inset: 0; overflow: hidden; display: none; }
    .slot > img { position: absolute; left: 0; top: 0; width: ${OUT.width}px; height: ${OUT.height}px; transform-origin: 0 0; }
    .slot .mask { position: absolute; inset: 0; }
    .slot .card { position: absolute; inset: 0; display: none; flex-direction: column; align-items: center; justify-content: center;
      text-align: center; background: radial-gradient(120% 140% at 0% 0%, #1F2C55 0%, #121A33 45%, #0B1020 100%); }
    /* In a corner, clear of the find bar when the camera is on it. */
    #keys { position: absolute; top: 40px; left: 48px; display: flex; gap: 16px; }
    #keys kbd { font: 700 44px/1 Atkinson, system-ui, sans-serif; color: #F4F6FC; background: #121A33; min-width: 84px;
      text-align: center; padding: 18px 26px; border: 3px solid #FFD60A; border-radius: 16px; box-shadow: 0 8px 28px rgba(0,0,0,0.55); }
    #sub { position: absolute; left: 50%; bottom: 44px; transform: translateX(-50%); max-width: 1560px; width: max-content;
      font: 600 42px/1.32 Atkinson, system-ui, sans-serif; color: #F4F6FC; text-align: center; text-wrap: balance;
      background: #0B1020; border: 2px solid #34437A; border-radius: 18px; padding: 14px 30px; }
    #sub:empty { display: none; }
    /* What Accessible Find reads aloud: a speaker, and the beam color. */
    #sub.reader { border: 3px solid #FFD60A; padding-left: 96px; font-style: italic; }
    #sub.reader::before { content: ''; position: absolute; left: 32px; top: 50%; width: 46px; height: 46px; translate: 0 -50%;
      background: #FFD60A; mask: url("${SPEAKER}") center / contain no-repeat; }
  </style></head><body>
    <div class="slot"><img alt=""><div class="mask"></div><div class="card"></div></div>
    <div class="slot"><img alt=""><div class="mask"></div><div class="card"></div></div>
    <div id="keys"></div><div id="sub"></div>
    <script>
      const slots = [...document.querySelectorAll('.slot')];
      const keys = document.getElementById('keys');
      const sub = document.getElementById('sub');
      window.render = async (s) => {
        const loads = [];
        s.slots.forEach((st, i) => {
          const el = slots[i];
          if (!st) { el.style.display = 'none'; return; }
          el.style.display = 'block';
          el.style.opacity = st.opacity;
          const img = el.querySelector('img'), card = el.querySelector('.card'), mask = el.querySelector('.mask');
          if (st.card !== undefined) {
            img.style.display = 'none'; mask.style.background = 'none'; card.style.display = 'flex';
            if (card.dataset.html !== st.card) { card.innerHTML = st.card; card.dataset.html = st.card; }
          } else {
            card.style.display = 'none'; img.style.display = 'block';
            if (img.dataset.src !== st.img) { img.dataset.src = st.img; img.src = st.img; loads.push(img.decode().catch(() => {})); }
            img.style.transform = st.transform;
            mask.style.background = st.mask;
          }
        });
        sub.textContent = s.sub;
        sub.style.opacity = s.subOpacity;
        sub.classList.toggle('reader', s.subReader);
        if (keys.dataset.label !== s.keys.join('+')) {
          keys.dataset.label = s.keys.join('+');
          keys.replaceChildren(...s.keys.map((k) => Object.assign(document.createElement('kbd'), { textContent: k })));
        }
        keys.style.opacity = s.keysOpacity;
        await Promise.all(loads);
      };
    </script></body></html>`;
}

async function ffmpeg(args: string[]): Promise<void> {
  await exec('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { maxBuffer: 1 << 26 });
}

/** Renders the video to `out`. Work files go to `work`. */
export async function compose(rec: Recorder, title: Card, end: Card, work: string, out: string): Promise<void> {
  const pieces = lay(rec, title, end);
  const total = pieces.at(-1)!.start + pieces.at(-1)!.seconds;
  const frames = Math.ceil(total * FPS);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: OUT, deviceScaleFactor: 1 });
  const html = await compositorHtml();
  await page.route('https://video.local/**', (route) => {
    const name = path.basename(new URL(route.request().url()).pathname);
    return name === 'index.html'
      ? route.fulfill({ body: html, contentType: 'text/html' })
      : route.fulfill({ path: path.join(work, name), contentType: 'image/jpeg' });
  });
  await page.goto('https://video.local/index.html');
  await page.evaluate(() => document.fonts.ready);

  const video = path.join(work, 'video.mp4');
  const encoder = spawn('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'image2pipe', '-framerate', `${FPS}`, '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', `${FPS}`, video,
  ]);
  const finished = once(encoder, 'exit');
  let last = '';
  let shot: Buffer = Buffer.alloc(0);
  for (let f = 0; f < frames; f++) {
    const state = stateAt(pieces, f / FPS);
    const key = JSON.stringify(state);
    // Most frames repeat the one before: only draw what changed.
    if (key !== last) {
      await page.evaluate((s) => (window as unknown as { render(s: unknown): Promise<void> }).render(s), state);
      shot = await page.screenshot({ type: 'jpeg', quality: 93 });
      last = key;
    }
    if (!encoder.stdin.write(shot)) await once(encoder.stdin, 'drain');
  }
  encoder.stdin.end();
  const [code] = await finished;
  await browser.close();
  if (code !== 0) throw new Error(`ffmpeg stopped with ${code}`);

  // The narration, each line where it was spoken.
  const lines = pieces.flatMap((p) => p.lines.map((l) => ({ start: p.start + l.at, line: l.line })));
  const audio = path.join(work, 'narration.wav');
  const inputs = lines.flatMap((l) => ['-i', l.line.file]);
  const delays = lines
    .map((l, i) => `[${i}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${Math.round(l.start * 1000)}:all=1[a${i}]`)
    .join(';');
  const mix = `${lines.map((_, i) => `[a${i}]`).join('')}amix=inputs=${lines.length}:normalize=0:dropout_transition=0,apad,loudnorm=I=-16:TP=-1.5:LRA=11[out]`;
  await ffmpeg([...inputs, '-filter_complex', `${delays};${mix}`, '-map', '[out]', '-t', total.toFixed(3), '-ar', '48000', audio]);
  await ffmpeg([
    '-i', video, '-i', audio, '-map', '0:v', '-map', '1:a',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', out,
  ]);
}
