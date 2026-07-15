import { createRoot } from 'react-dom/client';

import { GlobalStyles } from '@contentful/f36-components';
import { SDKProvider } from '@contentful/react-apps-toolkit';

import App from './App';
import LocalhostWarning from './components/LocalhostWarning';

const container = document.getElementById('root')!;
const root = createRoot(container);

// Mock mode (VITE_MOCK_SDK=1) renders the real app on seeded demo data
if (import.meta.env.DEV && window.self === window.top && !import.meta.env.VITE_MOCK_SDK) {
  // You can remove this if block before deploying your app
  root.render(<LocalhostWarning />);
} else {
  root.render(
    <SDKProvider>
      <GlobalStyles />
      <App />
    </SDKProvider>
  );
}
