// 本地测试环境常驻进程配置（pm2）。
//
// 背景：api/web 两个开发服务器之前是靠 Claude Code 会话里临时开的后台 shell 进程（nohup）
// 撑着的，一旦那次会话结束/终端关掉/电脑重启，进程就跟着没了，导致"测试地址打不开/登录不上"
// 反复出现。改用 pm2 托管后：进程崩了 pm2 自动重启；执行过 `pm2 save` + `pm2 startup`（见
// docs/本机测试环境自愈说明.md）之后，电脑重启/用户重新登录时 pm2 也会自动把这两个进程拉起来，
// 不再依赖某一次 Claude Code 会话还活着。
//
// 常用命令：
//   pm2 status              查看两个服务状态
//   pm2 logs banyuexuan-api 看api日志（logs banyuexuan-web看前端）
//   pm2 restart all         两个都重启一遍
//   pm2 save                改了这个文件之后要重新 save 一次，不然重启电脑不会生效
module.exports = {
  apps: [
    {
      name: 'banyuexuan-api',
      cwd: __dirname,
      script: 'npm',
      args: 'run start:dev --workspace=@banyuexuan/api',
      watch: false, // nest start --watch 自己管代码热重载，pm2 这层不用重复watch文件
      autorestart: true,
      max_restarts: 20,
      restart_delay: 2000,
    },
    {
      // AI 模型网关（Python/FastAPI）：智能客服、合同图片识别都要它。之前没有常驻，
      // apps/api 调 http://localhost:8000 连不上，页面报"AI 模型网关调用失败：fetch failed"。
      // 密钥写在 apps/ai-service/.env（被 git 忽略）；用 apps/ai-service/.venv 里的 Python 环境。
      name: 'banyuexuan-ai',
      cwd: __dirname + '/apps/ai-service',
      script: __dirname + '/apps/ai-service/.venv/bin/uvicorn',
      args: 'main:app --host 127.0.0.1 --port 8000',
      interpreter: 'none',
      watch: false,
      autorestart: true,
      max_restarts: 20,
      restart_delay: 2000,
      // 火山引擎/DeepSeek 等国内模型接口直连，不走本机的科学上网代理：代理端口一变（本机代理软件
      // 重启/换端口），pm2 里继承的旧代理地址就连不上，读图和对话会报 "All connection attempts failed"。
      env: {
        HTTP_PROXY: '',
        HTTPS_PROXY: '',
        http_proxy: '',
        https_proxy: '',
        ALL_PROXY: '',
        all_proxy: '',
      },
    },
    {
      name: 'banyuexuan-web',
      cwd: __dirname,
      script: 'npm',
      args: 'run dev --workspace=@banyuexuan/web -- --port 5180',
      watch: false,
      autorestart: true,
      max_restarts: 20,
      restart_delay: 2000,
    },
  ],
}
