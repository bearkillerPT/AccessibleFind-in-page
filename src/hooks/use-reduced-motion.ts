import { useEffect, useState } from 'react';
import type { MotionPref } from '@/lib/settings/types';

const QUERY = '(prefers-reduced-motion: reduce)';

/** Whether to leave out blinking and moving effects: the user's choice, or the system's with "Match my system". */
export function useReducedMotion(pref: MotionPref): boolean {
  const [system, setSystem] = useState(() => window.matchMedia(QUERY).matches);
  useEffect(() => {
    const media = window.matchMedia(QUERY);
    const onChange = () => setSystem(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);
  return pref === 'system' ? system : pref === 'reduce';
}
