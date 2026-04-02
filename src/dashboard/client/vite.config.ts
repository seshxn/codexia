import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../../../dist/dashboard-client',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          // React core — stable, aggressively cached
          'vendor-react': ['react', 'react-dom'],
          // Charts — large but shared across multiple views
          'vendor-charts': ['recharts'],
          // Graph engine — heavy, only needed on KnowledgeGraph tab (lazy loaded)
          'vendor-graph': ['sigma', 'graphology', 'graphology-layout-forceatlas2', 'graphology-layout-noverlap'],
          // Icons
          'vendor-icons': ['lucide-react'],
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3200',
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
