import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 2342,
    proxy: {
      '/api': {
        target: 'http://localhost:3434',
        changeOrigin: true
      }
    }
  }
})
