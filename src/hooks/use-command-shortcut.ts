import { useEffect, useState } from 'react';
import { currentShortcut } from '@/lib/platform';

/**
 * The key assigned to one of the extension's keyboard commands ('' for none, null while
 * checking). Polled, because it's changed on a browser page that sends no event.
 */
export function useCommandShortcut(command: string): string | null {
  const [shortcut, setShortcut] = useState<string | null>(null);
  useEffect(() => {
    const check = () => void currentShortcut(command).then(setShortcut);
    check();
    const timer = window.setInterval(check, 1500);
    window.addEventListener('focus', check);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', check);
    };
  }, [command]);
  return shortcut;
}
