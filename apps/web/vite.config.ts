import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: { enabled: true, type: 'module' }, // 开发环境也注册SW，方便直接在dev server里验证安装到主屏幕/离线缓存
      // API 请求走后端(3000端口)，不属于本应用的静态资源，不需要预缓存/离线兜底之外的处理。
      includeAssets: ['favicon.svg', 'icons.svg'],
      manifest: {
        name: '伴月轩月子中心管理系统',
        short_name: '伴月轩',
        description: '伴月轩月子中心管理系统 —— 管理后台',
        lang: 'zh-CN',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#1f3a5f',
        icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      workbox: {
        // 应用外壳(JS/CSS/HTML)走默认预缓存；只对"高频只读页面"的GET接口做运行时缓存
        // （今日房态/护理排班，呼应开发计划文档"离线只读缓存"的范围），
        // NetworkFirst：有网优先拿最新数据，离线时回退到上次成功缓存的数据，不缓存写操作。
        runtimeCaching: [
          {
            urlPattern: /\/api\/v1\/room\/rooms\/board(\?.*)?$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'room-board-cache',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
          {
            urlPattern: /\/api\/v1\/hr\/schedule-entries(\?.*)?$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'schedule-entries-cache',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    // 同时监听 IPv4 和 IPv6：只监听 ::1 时，浏览器/代理按 127.0.0.1 访问就会“无法访问此网站”
    host: true,
    proxy: {
      // 后端目前没有开 CORS，开发环境用 Vite 代理让浏览器视角是同源请求，
      // 绕开 CORS；生产部署如果前后端分属不同源，需要后端加 app.enableCors(...)。
      '/api/v1': {
        target: process.env.VITE_DEV_API_PROXY_TARGET ?? 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  preview: {
    proxy: {
      '/api/v1': {
        target: process.env.VITE_DEV_API_PROXY_TARGET ?? 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
