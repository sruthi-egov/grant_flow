import react from '@vitejs/plugin-react'
import path from 'node:path'
import { defineConfig } from 'vite'

// The Base44 vite plugin has been removed along with the SDK. Nothing in this
// build talks to Base44.
export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  server: {
    port: 5173,
    strictPort: true,
    // Bind all interfaces. By default Vite listens on ::1 only, so
    // http://127.0.0.1:5173 fails while http://localhost:5173 works — a
    // confusing difference during a demo. This also allows showing the app
    // from another device on the same network.
    host: true,
    proxy: {
      // Same-origin /api keeps the httpOnly session cookie working for
      // document downloads (opened as plain links, which cannot carry an
      // Authorization header) and sidesteps CORS entirely in development.
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
    },
  },

  preview: {
    port: 4173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },

  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
  },
});
