import { useEffect, useState } from 'react';
import { speechAvailable } from '@/lib/speech';

/** The browser's text-to-speech voices. They load asynchronously, hence the event. */
export function useVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() =>
    speechAvailable() ? speechSynthesis.getVoices() : [],
  );
  useEffect(() => {
    if (!speechAvailable()) return;
    const update = () => setVoices(speechSynthesis.getVoices());
    update();
    speechSynthesis.addEventListener('voiceschanged', update);
    return () => speechSynthesis.removeEventListener('voiceschanged', update);
  }, []);
  return voices;
}
