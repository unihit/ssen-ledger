import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json' with { type: 'json' }

export default defineConfig(({ command }) => ({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  // GitHub Pages: https://unihit.github.io/ssen-ledger/
  // 개발 서버는 루트(/)에서 그대로 실행합니다.
  base: command === 'build' ? '/ssen-ledger/' : '/',
  plugins: [
    react(),
    {
      name: 'dev-csp-relaxation',
      transformIndexHtml(html) {
        if (command !== 'serve') return html
        return html
          .replace("script-src 'self';", "script-src 'self' 'unsafe-inline';")
          .replace(
            'https://browser-intake-datadoghq.com;',
            'https://browser-intake-datadoghq.com ws://localhost:* ws://127.0.0.1:*;',
          )
      },
    },
  ],
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
