import { createRoot } from 'react-dom/client';
import { Practice } from '@/pages/practice/Practice';
import '@/styles/globals.css';

document.documentElement.classList.toggle('dark', window.matchMedia('(prefers-color-scheme: dark)').matches);
createRoot(document.getElementById('root')!).render(<Practice />);
