import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// Bolt serves previews from the domain root. GitHub Pages serves this
// repository under /obedbenson12-eng/, so its production build needs that base.
const base = process.env.GITHUB_ACTIONS ? '/obedbenson12-eng/' : '/';

export default defineConfig({
  base,
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
