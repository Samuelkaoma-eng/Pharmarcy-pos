import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Component tests. The server suite is API-level and proved unable to catch a
  // page that throws on its first row: DEF-038 and DEF-043 were the same crash
  // in two files, both passed the production build, and both were found only
  // when a person opened the page. These render the real components against a
  // mocked API so that class of defect fails the build instead.
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.js'],
    include: ['src/**/*.test.{js,jsx}'],
    css: false
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
});
