import path from 'path';

import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import tailwindcss from '@tailwindcss/vite';
import checker from 'vite-plugin-checker';

export default defineConfig({
  resolve: {
    alias: {
      '~': path.resolve(__dirname, './src'),
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    checker({
      typescript: true,
    }),
  ],
  test: {
    // Never scan nested git worktrees; they carry their own node_modules and
    // pollute the run with duplicate copies of tests and of React.
    exclude: [...configDefaults.exclude, 'worktrees/**'],
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    reporters: ['default', 'junit'],
    outputFile: {
      junit: './junit.xml',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
    },
  },
});
