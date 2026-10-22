import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    // API runs separately in dev (npm run dev:api); same paths as production
    proxy: {
      '/api': 'http://localhost:3001',
      '/api-docs': 'http://localhost:3001'
    }
  }
})
