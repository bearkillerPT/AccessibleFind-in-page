import { createRoot } from 'react-dom/client';
import { listenForPort } from '@/pages/findbar/channel';
import { FindBar } from '@/pages/findbar/FindBar';
import '@/styles/globals.css';

// Before React: the content script sends the port as soon as this page loads.
listenForPort();
// Start in the system theme to avoid a flash; saved preferences apply a moment later.
document.documentElement.classList.toggle('dark', window.matchMedia('(prefers-color-scheme: dark)').matches);
createRoot(document.getElementById('root')!).render(<FindBar />);
