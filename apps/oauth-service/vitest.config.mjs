import { defineConfig } from 'vite';

// Clean baseline configuration that got us to 202/206 tests passing
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    fileParallelism: false, // Run tests sequentially to avoid database conflicts
    threads: false, // Disable threading to fix Prisma issues - critical for Prisma
    server: {
      deps: {
        external: [
          /@prisma\/client/,
          /@relayforge\/database/,
          /\.prisma/,
        ],
      },
    },
  },
  resolve: {
    conditions: ['node'], // Use Node.js resolution
  },
});