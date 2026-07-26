import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      // 后端目前没有开 CORS，开发环境用 Vite 代理让浏览器视角是同源请求，
      // 绕开 CORS；生产部署如果前后端分属不同源，需要后端加 app.enableCors(...)。
      '/api/v1': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
