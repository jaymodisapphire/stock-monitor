import { defineConfig } from 'vitest/config';
import path from 'path';
export default defineConfig({
  resolve: { alias: { '@': path.resolve('.') } },
  esbuild: { loader: 'jsx', include: /\.jsx?$/, exclude: /node_modules/, jsx: 'automatic' },
  test: { include: ['__tests__/**/*.test.js'] }
});
