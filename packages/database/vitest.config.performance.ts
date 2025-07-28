import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/performance/setup-performance.ts'],
    fileParallelism: false,
    include: ['tests/performance/**/*.test.ts'],
    testTimeout: 60000, // 60 seconds for performance tests
    hookTimeout: 120000, // 2 minutes for setup
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});