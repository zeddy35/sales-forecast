import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// basit: alias yok (gerekirse ekleriz)
export default defineConfig({
  plugins: [react()],
})
