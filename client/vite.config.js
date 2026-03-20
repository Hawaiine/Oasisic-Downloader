/**
 * client/vite.config.js
 *
 * Vite build configuration for the Oasisic Downloader React SPA.
 *
 * Key points:
 *   - API proxy: during development, all /api/* and /downloads/* requests
 *     are forwarded to the Express server on port 3000. This avoids CORS
 *     issues and mimics the production single-origin deployment.
 *   - In production the Express server itself serves the built dist/ folder,
 *     so no proxy is needed post-build.
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  server: {
    port: 5173,
    // Proxy all backend routes to Express during `npm run dev`
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/downloads': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      // WebSocket proxy for Socket.IO
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true,
        changeOrigin: true,
      },
    },
  },

  build: {
    outDir: 'dist',
    // Generate source maps for production debugging
    sourcemap: false,
    // Split vendor chunks to improve caching
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          socketio: ['socket.io-client'],
        },
      },
    },
  },
});
