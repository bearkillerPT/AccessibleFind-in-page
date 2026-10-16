/** Reading text aloud with the browser's built-in voices (Web Speech API). */
import { browser } from 'wxt/browser';
import { E2E_SPOKEN_MESSAGE } from './messages';

export interface SpeakOptions {
  rate: number;
  /** A specific voice, or '' to let the browser pick one for `lang`. */
  voiceURI: string;
  /** Language of the text, usually the page's `lang`. */
  lang?: string;
  onStart?: () => void;
  /** When the reading finishes or fails. Not called when it's stopped or replaced: whoever did that knows. */
  onEnd?: () => void;
}

export const speechAvailable = () => typeof speechSynthesis !== 'undefined';

/** Longest piece read in one go: some voices, like Chrome's online ones, stop after about 15 seconds. */
const CHUNK_CHARS = 220;

/** Splits text into pieces of at most `max` characters: at sentence ends, or else between words. */
export function speechChunks(text: string, max = CHUNK_CHARS): string[] {
  const pieces: string[] = [];
  for (const sentence of text.replace(/\s+/g, ' ').trim().split(/(?<=[.!?…。！？])\s+/)) {
    if (sentence.length <= max) {
      if (sentence) pieces.push(sentence);
      continue;
    }
    let line = '';
    for (let word of sentence.split(' ')) {
      while (word) {
        const room = line ? max - line.length - 1 : max;
        if (word.length <= room) {
          line = line ? `${line} ${word}` : word;
          word = '';
        } else if (line) {
          pieces.push(line);
          line = '';
        } else {
          pieces.push(word.slice(0, max)); // A "word" longer than a whole piece.
          word = word.slice(max);
        }
      }
    }
    if (line) pieces.push(line);
  }
  // Short sentences go together, so a long text isn't read as many separate bits.
  const chunks: string[] = [];
  for (const piece of pieces) {
    const last = chunks[chunks.length - 1];
    if (last !== undefined && last.length + 1 + piece.length <= max) chunks[chunks.length - 1] = `${last} ${piece}`;
    else chunks.push(piece);
  }
  return chunks;
}

/** Counts readings, so the callbacks of one that was stopped or replaced are ignored. */
let reading = 0;
/**
 * The pieces being read. Chrome can garbage-collect an utterance nothing refers to while it's
 * still speaking, and then its end event never comes, so they're kept here until they end.
 */
const queued = new Set<SpeechSynthesisUtterance>();

/** Whether the browser is reading aloud, or has something waiting to be read. */
export function isSpeaking(): boolean {
  return speechAvailable() && (speechSynthesis.speaking || speechSynthesis.pending);
}

/** Reads `text` aloud, replacing anything being read. False if there's no speech or no text. */
export function speak(text: string, options: SpeakOptions): boolean {
  const chunks = speechChunks(text);
  if (!speechAvailable() || chunks.length === 0) return false;
  if (import.meta.env.MODE === 'e2e') {
    // Tests can't listen: they check what would be said in the service worker.
    void browser.runtime.sendMessage({ type: E2E_SPOKEN_MESSAGE, text: chunks.join(' ') }).catch(() => {});
  }
  speechSynthesis.cancel();
  queued.clear();
  const id = ++reading;
  const voice = options.voiceURI ? speechSynthesis.getVoices().find((v) => v.voiceURI === options.voiceURI) : undefined;
  let ended = false;
  const end = () => {
    if (ended || id !== reading) return;
    ended = true;
    options.onEnd?.();
  };
  chunks.forEach((chunk, i) => {
    const utterance = new SpeechSynthesisUtterance(chunk);
    utterance.rate = options.rate;
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else {
      utterance.lang = options.lang || navigator.language;
    }
    if (i === 0) utterance.onstart = () => id === reading && options.onStart?.();
    utterance.onend = () => {
      queued.delete(utterance);
      if (i === chunks.length - 1) end();
    };
    utterance.onerror = () => {
      queued.delete(utterance);
      end();
    };
    queued.add(utterance);
    speechSynthesis.speak(utterance);
  });
  return true;
}

export function stopSpeaking(): void {
  reading++;
  queued.clear();
  if (speechAvailable()) speechSynthesis.cancel();
}
