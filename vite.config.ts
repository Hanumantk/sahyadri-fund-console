/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// On GitHub Pages a project site is served from /<repo>/, so the built asset
// URLs need that prefix. The workflow passes the repo name in; anywhere else
// (local dev, Vercel, a user site) it stays at the root.
const base = process.env.VITE_BASE ?? '/';

export default defineConfig({
  base,
  plugins: [react()],
  test: {
    globals: true,
    // The data tests run in node; the design-freeze test needs a DOM, and asks
    // for one with a docblock pragma of its own.
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
