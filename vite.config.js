import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    '__BUILD_DATE__': JSON.stringify(new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(new Date()))
  },
  root: 'web',
  base: process.env.ELECTRON === 'true' ? './' : '/',
  build: {
    outDir: '../dist',
    assetsDir: 'assets',
    sourcemap: false,
    emptyOutDir: true
  }
})
