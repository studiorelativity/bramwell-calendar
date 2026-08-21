import { defineConfig } from 'vite';

// The service worker must be emitted to the site root, not /assets/, or its
// scope would be limited to /assets/ and it could not control the app shell.
export default defineConfig({
  build: {
    rollupOptions: {
      input: { main: 'index.html', sw: 'src/sw.ts' },
      output: {
        entryFileNames: (chunk) => (chunk.name === 'sw' ? 'sw.js' : 'assets/[name]-[hash].js'),
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
