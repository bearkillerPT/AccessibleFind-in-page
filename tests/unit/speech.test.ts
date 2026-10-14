import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { textInField } from '../../src/lib/selection';
import { isSpeaking, speak, speechChunks, stopSpeaking } from '../../src/lib/speech';

/** A stand-in for the browser's speech, which happy-dom doesn't have. Tests fire the events. */
class FakeUtterance {
  rate = 1;
  lang = '';
  voice: unknown = null;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly text: string) {}
}

let spoken: FakeUtterance[];

beforeEach(() => {
  spoken = [];
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
  vi.stubGlobal('speechSynthesis', {
    speaking: false,
    pending: false,
    getVoices: () => [],
    speak: (u: FakeUtterance) => spoken.push(u),
    cancel: vi.fn(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('speaking', () => {
  it('reads long text in sentence-sized pieces', () => {
    expect(speechChunks('  One.   Two!\nThree? ')).toEqual(['One. Two! Three?']);
    const long = `${'word '.repeat(60).trim()}. Short one.`;
    const chunks = speechChunks(long, 100);
    expect(chunks.every((c) => c.length <= 100)).toBe(true);
    expect(chunks.join(' ')).toBe(long);
    // A sentence that ends a piece keeps its full stop with it.
    expect(speechChunks('A first sentence. A second one.', 20)).toEqual(['A first sentence.', 'A second one.']);
    expect(speechChunks('x'.repeat(250), 100).map((c) => c.length)).toEqual([100, 100, 50]);
    expect(speechChunks('   ')).toEqual([]);
  });

  it('ends once, after the last piece of a long text', () => {
    const onEnd = vi.fn();
    expect(speak(`${'word '.repeat(100)}end.`, { rate: 1, voiceURI: '', onEnd })).toBe(true);
    expect(spoken.length).toBeGreaterThan(1);
    spoken[0]!.onend!();
    expect(onEnd).not.toHaveBeenCalled();
    spoken[spoken.length - 1]!.onend!();
    spoken[spoken.length - 1]!.onerror!();
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('ignores a reading that was stopped or replaced', () => {
    const first = vi.fn();
    speak('First.', { rate: 1, voiceURI: '', onEnd: first });
    const old = spoken[0]!;
    stopSpeaking();
    old.onerror!(); // Chrome reports the interrupted piece as an error.
    expect(first).not.toHaveBeenCalled();
    const second = vi.fn();
    speak('Second.', { rate: 1, voiceURI: '', onEnd: second });
    old.onend!();
    expect(second).not.toHaveBeenCalled();
    spoken[1]!.onend!();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('asks the browser whether something is being read', () => {
    expect(isSpeaking()).toBe(false);
    (speechSynthesis as unknown as { pending: boolean }).pending = true;
    expect(isSpeaking()).toBe(true);
  });

  it('has nothing to read in blank text', () => {
    expect(speak('   ', { rate: 1, voiceURI: '' })).toBe(false);
    expect(spoken).toEqual([]);
  });
});

describe('reading form fields', () => {
  const field = <T extends HTMLElement>(html: string) => {
    document.body.innerHTML = html;
    return document.body.firstElementChild as T;
  };

  it('reads the selected text, or else all of an input', () => {
    const input = field<HTMLInputElement>('<input value="lighthouse keeper">');
    expect(textInField(input)).toBe('lighthouse keeper');
    input.setSelectionRange(11, 17);
    expect(textInField(input)).toBe('keeper');
  });

  it('reads the sentence at the caret in a text area', () => {
    const area = field<HTMLTextAreaElement>('<textarea>First line. The second sentence is here. Last.</textarea>');
    area.setSelectionRange(16, 16);
    expect(textInField(area)).toBe('The second sentence is here.');
  });

  it('never reads a password', () => {
    const password = field<HTMLInputElement>('<input type="password" value="1234">');
    password.setSelectionRange(0, 4);
    expect(textInField(password)).toBe('');
  });

  it('reads the chosen option of a list', () => {
    expect(textInField(field('<select><option>One</option><option selected>Two</option></select>'))).toBe('Two');
  });
});
