import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  // The Google client ID is public, so the browser can reuse the server's GOOGLE_CLIENT_ID.
  // Only this one value is passed through; GOOGLE_CLIENT_SECRET and other keys never reach the browser.
  const googleClientId = env.VITE_GOOGLE_CLIENT_ID || env.GOOGLE_CLIENT_ID || '';

  return {
    plugins: [react()],
    define: {
      'import.meta.env.VITE_GOOGLE_CLIENT_ID': JSON.stringify(googleClientId)
    },
    server: {
      host: '127.0.0.1',
      port: 5173,
      // API runs separately in dev (npm run dev:api); same paths as production
      proxy: {
        '/api': 'http://localhost:3001',
        '/api-docs': 'http://localhost:3001'
      }
    }
  };
})
