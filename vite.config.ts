import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Frontend on 5200; all /api calls are proxied to the Express backend on 5201.
// The Anthropic key lives only in server/.env and never reaches this bundle.
export default defineConfig({
  plugins: [react()],
  // Force a single copy of React so zustand's hooks share the app's dispatcher.
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-dom/client', 'zustand'],
  },
  server: {
    port: 5200,
    proxy: {
      '/api': 'http://localhost:5201',
    },
  },
});
