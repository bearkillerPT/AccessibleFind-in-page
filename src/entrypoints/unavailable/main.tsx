import { createRoot } from 'react-dom/client';
import { Unavailable } from '@/pages/unavailable/Unavailable';
import '@/styles/globals.css';

document.documentElement.classList.toggle('dark', window.matchMedia('(prefers-color-scheme: dark)').matches);
createRoot(document.getElementById('root')!).render(<Unavailable />);
