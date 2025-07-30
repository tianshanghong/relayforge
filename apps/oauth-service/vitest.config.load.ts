import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    fileParallelism: false, // Run tests sequentially to avoid database conflicts
    include: ['tests/load-test.ts', 'tests/benchmark-1000.ts'],
    testTimeout: 300000, // 5 minutes for load tests
    hookTimeout: 60000, // 1 minute for setup/teardown
    pool: 'forks', // Use process forks for better isolation
    poolOptions: {
      forks: {
        singleFork: true, // Use single process to avoid database conflicts
      },
    },
  },
});