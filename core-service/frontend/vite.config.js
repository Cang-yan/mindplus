import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
// vite-plugin-vue-devtools@7.x 内部的 @vue/devtools-kit 在 Node.js 环境下
// 会调用 localStorage.getItem，导致 Vite 加载配置时崩溃，暂时禁用。
// import vueDevTools from 'vite-plugin-vue-devtools'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import Icons from 'unplugin-icons/vite'
import IconsResolver from 'unplugin-icons/resolver'
import {
  ArcoResolver,
  VueUseComponentsResolver,
  VueUseDirectiveResolver
} from 'unplugin-vue-components/resolvers'
import { FileSystemIconLoader } from 'unplugin-icons/loaders'
import UnoCSS from 'unocss/vite'
import configCompressPlugin from './plugins'

// ==================== 部署/环境变量说明（前端） ====================
//
// 1) 这是“构建期注入配置”：
//    - 通过 Vite 的 `define` 把 BASE_API_URL/BASE_WS_URL/BASE_SIGNAL_URL 等写入 bundle
//    - 构建产物生成后，单纯在服务器上替换 `.env.production` 不会影响已生成的静态文件（需重新 build 才会生效）
//
// 2) 环境变量来源：
//    - 优先读取项目根目录 `core-service/.env*`，兼容 `frontend/.env*`
//    - 建议使用根目录统一配置，避免前后端配置分叉
//
// 3) 推荐线上由 Nginx 统一入口：
//    - 静态站点：`/slide/`（与 `base` 对应）
//    - 反代：`/api/` -> API 服务（默认 3001），`/ws/` `/signal/` -> （可选）协作/信令服务

// 规范化 Vite 的 base：必须以 `/` 开头、以 `/` 结尾；`/` 表示根路径部署
const normalizeBase = (rawBase) => {
  const base = String(rawBase || '/').trim()
  if (base === '' || base === '/') return '/'
  const withLeadingSlash = base.startsWith('/') ? base : `/${base}`
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`
}

// 部署命名空间（namespace）：
// - 用途：隔离“不同部署版本”的协作房间（Yjs docId），避免不同版本互相污染
// - 策略：默认部署路径（/jit-slide/、/slide/）不启用 namespace；其它路径取第一段作为 namespace
// - 手动覆盖：设置 `DEPLOYMENT_NAMESPACE`（允许显式为空字符串，用于强制关闭）
const extractNamespaceFromPath = (basePath) => {
  const segments = String(basePath || '').replace(/^\/+|\/+$/g, '').split('/')
  if (segments.length === 0 || segments[0] === '') return ''
  if (segments[0] === 'jit-slide' || segments[0] === 'slide') return ''
  return segments[0]
}

export default defineConfig(({ mode }) => {
  // Vite 的 mode：
  // - `pnpm dev` -> development
  // - `pnpm build` -> production
  // - 可用 `vite --mode xxx` 强制指定
  const workspaceRoot = fileURLToPath(new URL('..', import.meta.url))
  const frontendRoot = fileURLToPath(new URL('.', import.meta.url))
  const env = {
    ...loadEnv(mode, workspaceRoot, ''),
    ...loadEnv(mode, frontendRoot, ''),
  }

  // ========== 对外服务地址（构建期注入到前端） ==========
  // 约定：
  // - API：/api/v1
  // - 协作（y-websocket）：/ws/:docId
  // - 信令通道：/signal/:docId
  //
  // 说明：ws_url/signal_url 建议是“以 /ws 或 /signal 结尾、且不带尾部斜杠”的基址，
  // WebsocketProvider 会把 roomName(docId) 拼到路径后形成 /ws/<docId>。
  const localIP = 'localhost'
  const normalizePort = (value, fallback) => {
    const n = Number.parseInt(String(value || ''), 10)
    return Number.isFinite(n) && n > 0 ? String(n) : String(fallback)
  }

  const devApiHost = env.VITE_DEV_API_HOST || env.AIPPT_BACKEND_HOST || localIP
  const devApiPort = normalizePort(env.VITE_DEV_API_PORT || env.AIPPT_BACKEND_PORT || env.PORT, 3001)
  // 若未配置协作/信令独立端口，则默认跟随 API 端口，避免对 3002 的硬依赖。
  const devWsHost = env.VITE_DEV_WS_HOST || env.AIPPT_COLLAB_HOST || devApiHost
  const devWsPort = normalizePort(
    env.VITE_DEV_WS_PORT || env.AIPPT_COLLAB_PORT || devApiPort,
    devApiPort
  )
  const devSignalHost = env.VITE_DEV_SIGNAL_HOST || env.AIPPT_SIGNAL_HOST || devWsHost
  const devSignalPort = normalizePort(
    env.VITE_DEV_SIGNAL_PORT || env.AIPPT_SIGNAL_PORT || devWsPort,
    devWsPort
  )
  const devPort = normalizePort(env.VITE_DEV_SERVER_PORT, 5173)
  const productionDomain = env.VITE_PRODUCTION_DOMAIN || env.DOMAIN || 'localhost'
  const productionProtocol = env.VITE_PRODUCTION_PROTOCOL || env.PROTOCOL || 'https'
  const productionWsScheme = productionProtocol === 'https' ? 'wss' : 'ws'

  const ws_url =
    env.VITE_WS_URL ||
    (mode === 'production'
      ? `${productionWsScheme}://${productionDomain}/ws`
      : `ws://${devWsHost}:${devWsPort}/ws`)
  const base_url =
    env.VITE_API_URL ||
    (mode === 'production'
      ? `${productionProtocol}://${productionDomain}`
      : `http://${devApiHost}:${devApiPort}`)
  const signal_url =
    env.VITE_SIGNAL_URL ||
    (mode === 'production'
      ? `${productionWsScheme}://${productionDomain}/signal`
      : `ws://${devSignalHost}:${devSignalPort}/signal`)

  // ========== 部署路径与产物目录 ==========
  // base：前端挂载路径（例如 /slide/）
  // outDir：构建输出目录（默认跟随 base 推导，例如 /slide/ -> slide/），方便直接上传到 Nginx 的站点根目录
  const appBase = normalizeBase(env.BASE_PATH || env.VITE_BASE || '/slide/')
  const inferredOutDir = appBase === '/' ? 'dist' : appBase.replace(/^\/|\/$/g, '')
  const outDir = env.VITE_OUT_DIR || inferredOutDir

  // ========== namespace 推导 ==========
  // 使用 `??` 是为了允许显式传入空字符串（例如 DEPLOYMENT_NAMESPACE=）来强制关闭 namespace
  const deployment_namespace =
    env.DEPLOYMENT_NAMESPACE ?? env.VITE_DEPLOYMENT_NAMESPACE ?? extractNamespaceFromPath(appBase)

  // ========== 图片服务/代理配置 ==========
  // 用途：导出/预览时可能需要做图片代理，避免跨域或无法直连（可选功能）
  // 优先级：IMAGE_SERVICE_URL > (IMAGE_SERVICE_HOST + IMAGE_SERVICE_PORT)
  const image_service_host = env.IMAGE_SERVICE_HOST || devApiHost
  const image_service_port = normalizePort(env.IMAGE_SERVICE_PORT, devApiPort)
  const image_service_url = env.IMAGE_SERVICE_URL || `http://${image_service_host}:${image_service_port}`
  const proxyApiTarget = env.VITE_DEV_API_PROXY_TARGET || `http://${devApiHost}:${devApiPort}`
  const proxyWsTarget = env.VITE_DEV_WS_PROXY_TARGET || `ws://${devWsHost}:${devWsPort}`
  const proxySignalTarget = env.VITE_DEV_SIGNAL_PROXY_TARGET || `ws://${devSignalHost}:${devSignalPort}`

  console.log(
    `[Vite Config] mode=${mode}, BASE=${appBase}, outDir=${outDir}, DEPLOYMENT_NAMESPACE=${deployment_namespace}`
  )

  return {
    define: {
      'process.browser': true,
      'process.env': {
        // 注意：这里写入的值会被打包进前端 bundle；线上更改这些值需要重新构建前端
        BASE_API_URL: base_url,
        BASE_WS_URL: ws_url,
        BASE_SIGNAL_URL: signal_url,
        UPLOAD_PATH: '/upload/free',
        DEPLOYMENT_NAMESPACE: deployment_namespace,
      // 图片服务配置
        IMAGE_SERVICE_URL: image_service_url,
        IMAGE_PROXY_ENABLED: env.IMAGE_PROXY_ENABLED || 'auto',
         // AI服务配置
        VITE_DEEPSEEK_API_KEY: process.env.VITE_DEEPSEEK_API_KEY || '',
        VITE_MINIMAX_API_KEY: process.env.VITE_MINIMAX_API_KEY || '',
      },
    },
    base: appBase,
    publicDir: 'public',
    build: {
      outDir,
    },
    esbuild: {
      pure: ['console.log', 'console.info', 'console.debug', 'console.warn'],
    },
    server: {
      host: '0.0.0.0',
      port: devPort,
      open: true,
      strictPort: false,
      cors: true,
      proxy: {
        // API 代理到后端服务
        '/api': {
          target: proxyApiTarget,
          changeOrigin: true,
          secure: false,
        },
        // 开发环境同源代理（避免 localhost/域名差异导致的跨域与解析问题）
        '/ws': {
          target: proxyWsTarget,
          ws: true,
          changeOrigin: true,
        },
      // 信令通道代理：/signal -> 后端信令服务
        '/signal': {
          target: proxySignalTarget,
          ws: true,
          changeOrigin: true,
        },
        // 图片代理接口（开发调试用）：/api/image-proxy?url=<原图URL>
        '/api/image-proxy': {
          target: image_service_url,
          changeOrigin: true,
          rewrite: (path) => {
          // 从查询参数中获取原始图片URL
            const url = new URL(path, 'http://localhost')
            const imageUrl = url.searchParams.get('url')
            if (imageUrl) {
            // 解析图片URL，提取路径部分
              try {
                const parsedUrl = new URL(imageUrl)
                return parsedUrl.pathname + parsedUrl.search
              } catch {
                return '/404'
              }
            }
            return '/404'
          },
        },
      },
    },
    plugins: [
      vue(),
      vueJsx(),
      // vueDevTools(), // 禁用，见顶部注释
      UnoCSS({
        configFile: './unocss.config.js',
      }),
      AutoImport({
        include: [/\.[tj]sx?$/, /\.vue$/, /\.vue\?vue/, /\.md$/],
        imports: ['vue', 'pinia', 'vue-router', 'vue-i18n', '@vueuse/core'],
        eslintrc: {
          enabled: true,
          filepath: './.eslintrc-auto-import.json',
          globalsPropValue: true,
        },
        resolvers: [ArcoResolver()],
      }),
      Components({
        dirs: ['src/components/', 'src/views/', 'src/layout'],
        include: [/\.vue$/, /\.vue\?vue/, /\.md$/],
        resolvers: [
          ArcoResolver({
            sideEffect: true,
          }),
          VueUseComponentsResolver(),
          VueUseDirectiveResolver(),
          IconsResolver({
            prefix: 'icon',
            customCollections: ['px'],
          }),
        ],
      }),
      Icons({
        compiler: 'vue3',
        customCollections: {
          isle: FileSystemIconLoader('src/assets/svg/isle', (svg) =>
            svg.replace(/^<svg /, '<svg fill="currentColor" ')
          ),
        },
        autoInstall: true,
      }),
      configCompressPlugin("gzip")
    ],
    optimizeDeps: {
      exclude: [
        '@antv/component', // Has tslib version conflict
      ],
      include: [
        '@antv/infographic',
        'react',
        'react-dom',
        'react-dom/client',
        'react/jsx-runtime',
        '@univerjs/engine-render',
        '@univerjs/core',
        '@univerjs/design',
        '@univerjs/docs',
        '@univerjs/docs-ui',
        '@univerjs/engine-formula',
        '@univerjs/sheets',
        '@univerjs/sheets-formula',
        '@univerjs/sheets-formula-ui',
        '@univerjs/sheets-numfmt',
        '@univerjs/sheets-ui',
        '@univerjs/ui',
      ],
      esbuildOptions: {
        define: {
          global: 'globalThis'
        },
        // Handle Node.js built-ins for browser environment
        platform: 'browser',
        mainFields: ['browser', 'module', 'main'],
      }
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    css: {
      preprocessorOptions: {
        scss: {
          // Use Dart Sass modern API to avoid legacy-js-api deprecation warnings.
          api: 'modern-compiler',
          style: 'compressed',
        },
      },
    },
  }
})
