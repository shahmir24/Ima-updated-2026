import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { registerServiceWorker } from './lib/register-service-worker'
import { installPromptStore } from './lib/pwa/install-prompt'

// Before the first render: Chromium can offer its install prompt as soon as
// the page loads, and an event nobody is listening for is lost.
if (typeof window !== 'undefined') installPromptStore.start(window);

createRoot(document.getElementById("root")!).render(<App />);

registerServiceWorker({
  isProduction: import.meta.env.PROD,
  navigator: typeof navigator === 'undefined' ? undefined : navigator,
  window: typeof window === 'undefined' ? undefined : window
});
