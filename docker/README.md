# 本机 Docker 部署

部署源：ZJU-REAL/Easel，提交 4b9c03c。ARM64 原生构建，OpenClaw 固定为 2026.9.7。

在本 worktree 中运行：

```bash
docker compose up -d --build
docker compose ps
docker compose logs --tail 100
```

监听 0.0.0.0:7870，局域网访问 http://192.168.10.132:7870 （或 http://192.168.10.133:7870），本机访问 http://127.0.0.1:7870 。模型配置在页面「设置」中填写，API key 不放入镜像。
连接宿主机模型服务时，使用 `http://host.docker.internal:端口`，不能用容器的 localhost。
远程电脑可通过 `ssh -L 7870:127.0.0.1:7870 sean@主机地址` 访问。

首次启动初始化独立 OpenClaw easel profile，并同步上游技能；Chromium 带虚拟显示以支持浏览器登录。
未配置模型前，工作台可以打开，但 AI 对话不能完成。平台登录、真实媒体生成和发布需各自配置后验证。

两个持久卷：`easel_app` 保存 /app（包含 .env、素材、产物、画像、平台凭据和会话）；
`easel_home` 保存 /root（OpenClaw 配置、会话、浏览器登录状态与缓存）。
.env 所在目录整体持久化，兼容上游设置面板的原子文件替换。
停止使用 `docker compose stop`，恢复使用 `docker compose up -d`；禁止用 `down -v`，该命令会删除数据。

备份时先 `docker compose stop`，再分别用临时容器挂载这两个卷并 tar 导出，完成后启动。
应用代码也在 app 卷内：重新 build 不会覆盖已有卷中的代码。升级应先备份两卷，
创建新的 app 卷，再迁移 .env、outputs、assets、profiles、cookies.json 等业务文件；保留原卷用于回退。
不得直接删除旧卷来升级。

已按本机两个局域网地址配置 EASEL_EXTRA_HOSTS / EASEL_EXTRA_ORIGINS；其他域名需精确添加。

当前基础镜像包含上游依赖、常用 PDF 库与 PATH 上的 Chrome for Testing。
环境体检中的 Whisper large-v3 权重和具体 Remotion 工程依赖需要使用对应功能时再下载/初始化，未预装。
固定容器 hostname 并在停止时关闭 Gateway，避免容器重建后残留跨主机租约。
异常断电后若出现 Gateway owner lease 错误，保留数据卷并等待旧租约最多 5 分钟过期，容器会自动重试。

## 临时交互登录桌面

```bash
docker compose -f compose.yaml -f compose.desktop.yaml up -d --no-deps easel
docker exec easel easel-start-desktop
```

入口：http://192.168.10.132:6080/vnc.html?autoconnect=true&resize=scale
随机 VNC 密码在容器 `/root/.easel-desktop/password`（权限 600），不要写进仓库。
浏览器窗口可以扫码或手机号登录，验证码由用户在桌面中自行输入。
窗口登录使用上游脚本 `login --headed --no-proxy`，登录态沿用已有持久卷。
临时桌面进程不会随容器启动自动运行。登录完成后执行下面命令撤掉桌面端口，保留登录态：

```bash
docker compose -f compose.yaml up -d --no-deps easel
```

## 聊天流与图片预览修复（2026-10-01）

运行卷中保留 `scripts/patch_openclaw_streaming.py`，入口脚本在网关启动前应用。
补丁限定 OpenClaw 2026.9.7：独立 reasoning 字段在正文之前到达时，切回正常增量标签解析；混合内容仍保持严格保护。升级 OpenClaw 前须复核补丁，未知版本会明确报错。依赖原文件备份为相邻 `.mjs.bak-easel-stream`。

Web 使用 HTTP 首个 role chunk 的 run id 匹配原生流，两路正文择一转发，等原生流读完再收尾。前端把 Markdown 图片中的本地产物地址转换为 `/api/media/`。运行 Web 文件和前端构建已分别备份为 `app.py.bak-chat-stream-media`、`dist.bak-chat-stream-media`。

## 聊天执行进度（2026-10-01）

仓库 compose 默认使用根 Dockerfile，支持首次完整安装。本机本次更新曾使用 `docker/Dockerfile.progress`，基于已有的 `local/easel:chat-stream-media-20261001` 增量构建，保留已经验证的依赖版本；该增量文件需要本机已有基础镜像。

复用 question bridge 的 Gateway agent 事件，按当前 run id 展示模型轮次及工具开始、完成、失败；不展示工具参数、命令和原始结果。聊天窗口实时展开执行进度并显示当前步骤耗时。更新须等正在执行的聊天结束。

本次运行卷备份：`web/app.py.bak-chat-progress`、`easel/gateway_questions.py.bak-chat-progress`、`web/frontend/dist.bak-chat-progress`。回退时恢复这些文件并使用上一镜像，仅重建 easel 服务。

## 上传附件与看图通道（2026-10-01）

用户消息显示上传图片缩略图及附件链接，附件引用继续保存在会话中供重试。当前状态和耗时实时显示，完整执行记录默认折叠。

设置新增「看图」通道，使用独立 `EASEL_VISION_MODEL`、`EASEL_VISION_BASE_URL`、`EASEL_VISION_API_KEY`；Key 只脱敏返回，换地址必须重填 Key。图片先经过当前会话所有权检查和 EXIF 方向校正，缩放至最长边 1600 后一次性请求 OpenAI-compatible chat completions，显式 `reasoning_effort=low`。识别文字作为素材交给主模型，失败时明确报错，不继续盲目读图。未上传图片的请求不调用看图模型。

当前看图模型 gpt-6-luna，主模型 opencode/deepseek-v4.1-flash。真实红蓝测试及浏览器仅上传图片流程通过；原会话里的 Playwright 缺失属于制卡工具问题，本次未安装新依赖。运行文件回退备份为 `web/app.py.bak-chat-vision`、`web/frontend/dist.bak-chat-vision`、`.env.bak-chat-vision`；回退镜像 `local/easel:chat-progress-20261001`。

## WebP 预览与主题（2026-10-01）

聊天、上传附件、内容库和发布媒体选择器默认通过 `?preview=1` 请求最长边 640 像素、质量 68 的 WebP，点击聊天及内容详情图片打开原图。原图不修改；派生图缓存于系统临时目录 `easel-image-previews`，按原文件路径、修改时间和大小失效。SVG、视频、登录二维码沿用原始资源。

侧边栏可切换白天/黑夜主题，首次跟随系统，选择保存于浏览器 `easel_theme`；页面、设置面板和弹窗共用主题颜色。

本机运行镜像 `local/easel:webp-themes-20261001`。运行卷回退备份为 `web/app.py.bak-webp-themes`、`web/frontend/dist.bak-webp-themes`；仅恢复这些文件、切回前一镜像并重建 easel 服务，保留业务数据卷。
