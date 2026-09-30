import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/postcss';
import {fileURLToPath} from 'node:url';
const project = fileURLToPath(new URL('../../', import.meta.url));
export default defineConfig({
  root: fileURLToPath(new URL('./', import.meta.url)),
  publicDir: project + 'public',
  resolve: {alias: [
    {find: './supabase-config', replacement: fileURLToPath(new URL('./supabase-config.ts', import.meta.url))},
    {find: './workspace', replacement: fileURLToPath(new URL('./workspace.tsx', import.meta.url))},
    {find: '@', replacement: project},
  ]},
  plugins: [react()],
  css: {postcss: {plugins: [tailwind()]}},
  server: {host: '127.0.0.1', port: 4175, strictPort: true},
});
