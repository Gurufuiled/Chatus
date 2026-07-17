import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { resolve } from 'node:path';

export default defineConfig({
  base: '/embed/',
  define: {
    'import.meta.env.VITE_APP_MODE': JSON.stringify('embed'),
    global: 'globalThis',
  },
  build: {
    outDir: resolve(__dirname, '../server/public/embed'),
    emptyOutDir: true,
    commonjsOptions: {
      // ts-ebml does `const { tools } = require("ebml")` — keep CJS interop intact.
      transformMixedEsModules: true,
      include: [/node_modules/],
    },
  },
  plugins: [
    react(),
    // Buffer/global for ts-ebml remux of MediaRecorder WebM (seekable recordings).
    nodePolyfills({
      include: ['buffer', 'process'],
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    }),
  ],
  optimizeDeps: {
    // Pin React into a single optimized chunk so QueryClientProvider / hooks
    // never bind against a second copy after vite cache churn (Invalid hook call).
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      '@tanstack/react-query',
      'buffer',
      'ebml',
      'ts-ebml',
      'ebml-block',
      'int64-buffer',
      'matroska-schema',
    ],
    esbuildOptions: {
      define: {
        global: 'globalThis',
      },
    },
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      '@': resolve(__dirname, './src'),
      // Force CJS main — ebml's "browser"/"module" fields break ts-ebml's tools import.
      ebml: resolve(__dirname, 'node_modules/ebml/lib/ebml.js'),
      buffer: 'buffer/',
    },
  },
  server: {
    port: 5173,
    fs: {
      allow: [resolve(__dirname, '..')],
    },
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
