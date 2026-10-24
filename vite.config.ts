import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => ({
  // GitHub Pages: https://unihit.github.io/ssen-ledger/
  // 개발 서버는 루트(/)에서 그대로 실행합니다.
  base: command === 'build' ? '/ssen-ledger/' : '/',
  plugins: [react()],
  resolve: {
    preserveSymlinks: true,
  },
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-datadog': ['@datadog/browser-rum', '@datadog/browser-logs'],
        },
      },
    },
  },
}))
