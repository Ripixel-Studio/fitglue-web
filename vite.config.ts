import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import { resolve } from 'path';

export default defineConfig(({ mode }) => {
  // Load environment variables based on the mode (development, production, etc.)
  // Set third argument to '' to load all env vars, regardless of prefix
  const env = loadEnv(mode, process.cwd(), '');
  // Determine if Sentry should be enabled (needs Auth Token and Org/Project)
  const isSentryEnabled = Boolean(
    (process.env.SENTRY_AUTH_TOKEN || env.SENTRY_AUTH_TOKEN) &&
    (process.env.SENTRY_ORG || env.SENTRY_ORG) &&
    (process.env.SENTRY_PROJECT || env.SENTRY_PROJECT)
  );

  const releaseName = `fitglue-web-app@${new Date().toISOString()}`;

  return {
    plugins: [
      react(),
      // Upload source maps if Sentry is configured (regardless of mode)
      isSentryEnabled && sentryVitePlugin({
        org: process.env.SENTRY_ORG || env.SENTRY_ORG,
        project: process.env.SENTRY_PROJECT || env.SENTRY_PROJECT,
        authToken: process.env.SENTRY_AUTH_TOKEN || env.SENTRY_AUTH_TOKEN,
        sourcemaps: {
          assets: './dist/**',
          ignore: ['node_modules'],
          // Delete source maps from dist after uploading to Sentry so they
          // are not served publicly via Firebase Hosting.
          filesToDeleteAfterUpload: './dist/**/*.map',
        },
        release: {
          name: releaseName,
        },
        // Don't fail the build if source map upload fails
        errorHandler: (err) => {
          console.warn('Sentry source map upload failed:', err);
        },
      }),
    ].filter(Boolean),
    resolve: {
      dedupe: ['react', 'react-dom'],
    },
    server: {
      host: true,
      port: 5173,
      proxy: {
        '/api/v2': {
          target: 'http://localhost:8080',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/v2/, ''),
        },
      },
    },
    // Define global constants replacement
    define: {
      'import.meta.env.VITE_SENTRY_RELEASE': JSON.stringify(releaseName),
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: mode === 'development' ? true : 'hidden',
      minify: mode !== 'development', // Disable minification in dev for React DevTools
      rollupOptions: {
        input: {
          app: resolve(__dirname, 'public/app/index.html'),
        },
        output: {
          sourcemapExcludeSources: true,
          entryFileNames: 'assets/[name]-[hash].js',
        },
      },
    },
  };
});

