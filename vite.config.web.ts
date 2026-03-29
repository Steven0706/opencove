import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  root: 'src/app/renderer',
  build: {
    outDir: resolve(__dirname, 'out/web'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'src/app/renderer/index-web.html'),
      },
    },
  },
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      '@app': resolve(__dirname, 'src/app'),
      '@contexts': resolve(__dirname, 'src/contexts'),
      '@platform': resolve(__dirname, 'src/platform'),
      '@shared': resolve(__dirname, 'src/shared'),
    },
  },
  server: {
    // In dev mode, proxy API calls to the backend server
    proxy: {
      '/api': {
        target: 'http://localhost:3200',
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
