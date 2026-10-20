import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The built app is served by the Python server (paybybot3 web).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
  build: { outDir: '../paybybot3/static', emptyOutDir: true },
  // Dev: the Python server checks that calls come from its own origin, so the proxy presents them as such.
  server: {
    proxy: { '/api': { target: 'http://127.0.0.1:8765', changeOrigin: true, headers: { origin: 'http://127.0.0.1:8765' } } },
  },
})
