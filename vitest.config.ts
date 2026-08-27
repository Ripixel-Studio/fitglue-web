import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      // Count every source file, not just the ones a test happens to import,
      // so the reported number reflects the whole codebase honestly.
      all: true,
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        'src/shared/api/schema*.ts',
        'src/types/pb/**',
        'src/app/data/**',
        'src/test/**',
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        '**/*.d.ts',
      ],
      // Ratchet floor: set to the current whole-codebase coverage so it can
      // never regress. Raise these as untested files gain tests.
      thresholds: {
        lines: 65,
        functions: 51,
        branches: 50,
        statements: 62,
      },
    },
  },
});
