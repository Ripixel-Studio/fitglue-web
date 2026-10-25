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
      // Ratchet floor = current whole-tree coverage. Lowered a few tenths when
      // the (well-tested) admin console and then the FCM push/notification-prefs
      // code were deleted in the single-user conversion (F1.2, F1.3), and by
      // ~6.5 points in F1.5b when the showcase SPA (src/showcase/**, the most
      // thoroughly tested tree in the repo) was deleted: what remains is the
      // less-covered settings app. Whole-tree coverage after F1.5b: lines
      // 58.89, functions 44.71, branches 45.61, statements 55.94.
      thresholds: {
        lines: 58.8,
        functions: 44.7,
        branches: 45.6,
        statements: 55.9,
      },
    },
  },
});
