import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  base: '/app/',
  publicDir: resolve(__dirname, 'public-app'),
  define: {
    'import.meta.env.VITE_APP_MODE': JSON.stringify('standalone'),
  },
  build: {
    outDir: resolve(__dirname, '../server/public/app'),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'app.html'),
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5174,
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
