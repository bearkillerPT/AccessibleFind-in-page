// Records what Chrome asks this voice to say ("speak: …", "stop"), and pretends to speak for 400 ms.
globalThis.said = [];
let timer = 0;
chrome.ttsEngine.onSpeak.addListener((utterance, _options, sendTtsEvent) => {
  globalThis.said.push(`speak: ${utterance}`);
  sendTtsEvent({ type: 'start', charIndex: 0 });
  clearTimeout(timer);
  timer = setTimeout(() => sendTtsEvent({ type: 'end', charIndex: utterance.length }), 400);
});
chrome.ttsEngine.onStop.addListener(() => {
  clearTimeout(timer);
  globalThis.said.push('stop');
});
