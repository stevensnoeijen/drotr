import fs from 'node:fs';
import path from 'path';

import { configDefaults, defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import tailwindcss from '@tailwindcss/vite';
import checker from 'vite-plugin-checker';

/** URL prefix the original CD data is served under during development. */
const CD_URL_PREFIX = 'cd/';

/**
 * Serves the local, gitignored copy of the original game's CD data
 * (`.cd/`) over the dev server, so tools like the `?case=atlas` viewer can
 * fetch and decode the real `.ART` files in the browser.
 *
 * Development only, and deliberately so: the CD data is original commercial
 * game content that is never committed or bundled, so a production build
 * has nothing to serve and the viewer reports it as missing.
 */
function serveCdData(): Plugin {
  const cdDir = path.resolve(
    process.env.DROTR_CD_DIR ?? path.resolve(import.meta.dirname, '.cd')
  );
  let base = '/';

  return {
    name: 'drotr:serve-cd-data',
    apply: 'serve',
    configResolved(config) {
      base = config.base;
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = (req.url ?? '').split('?')[0];
        const withoutBase = pathname.startsWith(base)
          ? pathname.slice(base.length)
          : pathname.replace(/^\//, '');
        if (!withoutBase.startsWith(CD_URL_PREFIX)) {
          next();
          return;
        }

        const relative = decodeURIComponent(
          withoutBase.slice(CD_URL_PREFIX.length)
        );
        const resolved = path.resolve(cdDir, relative);
        // Keep a crafted URL from walking out of the data directory.
        if (resolved !== cdDir && !resolved.startsWith(cdDir + path.sep)) {
          res.statusCode = 403;
          res.end('Forbidden');
          return;
        }

        fs.readFile(resolved, (error, data) => {
          if (error) {
            res.statusCode = 404;
            res.setHeader('Content-Type', 'text/plain');
            res.end(
              `Not found: ${relative}. Expected it under ${cdDir} (override with DROTR_CD_DIR).`
            );
            return;
          }
          res.setHeader('Content-Type', 'application/octet-stream');
          res.setHeader('Content-Length', String(data.length));
          res.end(data);
        });
      });
    },
  };
}

export default defineConfig({
  // Deploy targets (e.g. GitHub Pages) set BASE_URL to the subpath the app
  // is served from; local dev/build defaults to the site root.
  base: process.env.BASE_URL ?? '/',
  resolve: {
    alias: {
      '~': path.resolve(import.meta.dirname, './src'),
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    checker({
      typescript: true,
    }),
    serveCdData(),
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
      reporter: ['text', 'lcov', 'html'],
    },
  },
});
