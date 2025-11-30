import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  root: 'web',
  base: process.env.ELECTRON === 'true' ? './' : '/',
  build: {
    outDir: '../dist',
    assetsDir: 'assets',
    sourcemap: false,
    emptyOutDir: true
  }
})
