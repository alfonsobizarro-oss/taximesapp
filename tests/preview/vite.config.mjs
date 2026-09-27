import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/postcss';
import {fileURLToPath} from 'node:url';
const project = fileURLToPath(new URL('../../', import.meta.url));
export default defineConfig({
  root: fileURLToPath(new URL('./', import.meta.url)),
  resolve: {alias: {'@': project}},
  plugins: [react()],
  css: {postcss: {plugins: [tailwind()]}},
  server: {host: '127.0.0.1', port: 4174, strictPort: true},
});
