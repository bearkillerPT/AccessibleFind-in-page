import { createRoot } from 'react-dom/client';
import { OptionsApp } from '@/pages/options/OptionsApp';
import '@/styles/globals.css';

document.documentElement.classList.toggle('dark', window.matchMedia('(prefers-color-scheme: dark)').matches);
createRoot(document.getElementById('root')!).render(<OptionsApp />);
