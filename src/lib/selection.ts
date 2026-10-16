import { sentenceText } from './search/matcher';

/** Selected text, prepared for use as a search: whitespace collapsed, long text shortened. */
export const SELECTION_MAX = 300;

export function cleanSelection(raw: string | null | undefined): string {
  const text = (raw ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= SELECTION_MAX) return text;
  // Long selections still find the same spot from their beginning; cut at a word.
  const cut = text.slice(0, SELECTION_MAX);
  const space = cut.lastIndexOf(' ');
  return space > SELECTION_MAX / 2 ? cut.slice(0, space) : cut;
}

/**
 * What read aloud reads in a form field: the text selected in it, or else the whole text of
 * an input, the sentence at the caret in a text area, or a list's chosen option. Never a
 * password.
 */
export function textInField(el: HTMLElement): string {
  if (el instanceof HTMLSelectElement) return el.selectedOptions[0]?.text ?? '';
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return '';
  if (el instanceof HTMLInputElement && el.type === 'password') return '';
  const { value, selectionStart: start, selectionEnd: end } = el;
  if (start === null || end === null) return ''; // Not a text field: a checkbox, a number...
  if (end > start) return value.slice(start, end);
  return el instanceof HTMLTextAreaElement ? sentenceText(value, { start, end: start }) : value;
}
