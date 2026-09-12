import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],

  // Relative asset paths. The app is entirely client-side, so this makes the
  // built `dist/` folder portable: it works opened straight off the disk, and
  // from any sub-path (e.g. a GitHub Pages project URL) without rebuilding.
  base: './',

  server: {
    // Listen on the LAN too, so you can open the app on your phone while the
    // Mac serves it — the only way to sanity-check a sideline tool is on the
    // device you'll actually be holding.
    host: true,
  },
});
