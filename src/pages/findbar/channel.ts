/**
 * Receives the MessagePort the content script sends when this iframe loads.
 *
 * The listener must exist before the iframe's load event (which is when the port is sent),
 * so it's installed when this module is first imported, not in a React effect, which can
 * run after load.
 */
import { CONNECT_MESSAGE } from '@/lib/messages';

let port: MessagePort | null = null;
const waiting = new Set<(port: MessagePort) => void>();

export function listenForPort(): void {
  const nonce = location.hash.slice(1);
  const onMessage = (e: MessageEvent) => {
    const data = e.data as { type?: string; nonce?: string } | null;
    if (e.source !== window.parent || data?.type !== CONNECT_MESSAGE) return;
    // The nonce proves the message is from our content script, not the page.
    if (!nonce || data.nonce !== nonce || !e.ports[0]) return;
    window.removeEventListener('message', onMessage);
    port = e.ports[0];
    for (const resolve of waiting) resolve(port);
    waiting.clear();
  };
  window.addEventListener('message', onMessage);
}

/** Calls back with the port once connected (immediately if it already is). */
export function onPort(callback: (port: MessagePort) => void): () => void {
  if (port) {
    callback(port);
    return () => {};
  }
  waiting.add(callback);
  return () => waiting.delete(callback);
}
