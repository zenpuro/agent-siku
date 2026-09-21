import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: { cli: 'src/cli.ts' },
  format: 'esm',
  outDir: 'dist',
  outExtensions: () => ({ js: '.mjs' }),
  banner: { js: '#!/usr/bin/env node' },
});
