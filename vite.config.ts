import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // Keep local auth testing quiet and stable behind the Express dev wrapper.
      hmr: false,
      watch: null,
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return;
            if (id.includes('/react/') || id.includes('/react-dom/')) return 'react';
            if (id.includes('/@firebase/') || id.includes('/firebase/')) return 'firebase';
            if (id.includes('/recharts/') || id.includes('/d3-')) return 'charts';
            if (id.includes('/motion/')) return 'animation';
          },
        },
      },
    },
  };
});
