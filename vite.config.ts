import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig(() => ({
  base: '', // relative paths
  resolve: {
    // VITE_MOCK_SDK=1 npm start → app runs standalone on seeded demo data
    // (screenshots, UI iteration, prospect demo mode — no Contentful login)
    alias: process.env.VITE_MOCK_SDK
      ? { '@contentful/react-apps-toolkit': '/src/dev/mockToolkit.tsx' }
      : {},
  },
  server: {
    port: 3000,
  },
  build: {
    outDir: 'build',
  },
  plugins: [react()],
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./src/setupTests.ts'],
  },
}));
