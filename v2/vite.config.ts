import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// base: './' keeps asset URLs relative, so the built app runs from any static host or folder.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()]
})
