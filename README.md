# 🧲 Oasisic Downloader

> YouTube 高品质音视频下载系统 · 自托管 · 无广告 · 无限制

[![Docker](https://img.shields.io/badge/docker-ready-2496ED?logo=docker&logoColor=white)](https://hub.docker.com/r/barryallen26/oasisic-downloader)
[![Node](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

---

## ✨ 预览

| 界面 | 说明 |
|------|------|
| 🏠 **主界面** | 输入 YouTube 链接 → 自动解析视频/播放列表信息 |
| 🎵 **音频下载** | FLAC · ALAC · M4A · MP3 · WAV · AAC · Opus 七种格式 |
| 🎬 **视频下载** | 4K / 2K / 1080p / 720p，MP4 / MKV 封装 |
| 📋 **播放列表** | 勾选下载，实时进度 + 日志，每首完成后独立保存 |
| 🖼 **封面预览** | 全屏弹窗查看最高清封面，一键下载保存 |
| 🏷 **元数据** | 自动写入标题/艺术家/专辑/年份，繁→简中文转换 |
| 🎤 **歌词搜索** | 网易云 → QQ音乐 → LRCLib → Apple Music → Spotify，支持时间轴同步 |
| 📀 **元数据增强** | MusicBrainz + Deezer + 网易云自动查询，补全/修正歌曲信息 |
| 🎧 **播放器** | 下载后自动入队，上/下曲，自动续播，音量控制 |
| ⚡ **实时进度** | WebSocket 推送速度 / ETA / 百分比 / 日志 |
| 🌙 **主题切换** | 深色 / 浅色 / 跟随系统 |

---

## 🐳 Docker 部署

### 方式 A：从 Docker Hub 拉取（推荐，免构建）

```bash
# 首次部署
mkdir ~/oasisic && cd ~/oasisic
wget https://raw.githubusercontent.com/Hawaiine/oasisic-downloader/main/docker-compose.pull.yml
docker compose -f docker-compose.pull.yml up -d

# 查看状态
docker compose -f docker-compose.pull.yml logs -f
```

### 方式 B：本地构建

```bash
git clone https://github.com/Hawaiine/oasisic-downloader.git
cd Oasisic-Downloader
docker compose up -d --build
```

访问 **`http://你的IP:3000`** 🎉

> 📖 完整 Docker 指南：[DOCKER.md](DOCKER.md) — 镜像说明、配置、代理、cookies、FAQ

### 可选配置

```bash
# 停止服务后编辑
docker compose stop

# 添加 Spotify 凭证（歌词搜索辅助）
# 编辑 docker-compose.yml，取消注释 SPOTIFY_CLIENT_ID 和 SPOTIFY_CLIENT_SECRET

# 添加浏览器 Cookie（解决 YouTube 机器人检测）
# 浏览器安装 "Get cookies.txt" 扩展 → 导出 youtube.com 的 cookies
# 将 cookies.txt 放到项目目录，取消注释 docker-compose.yml 中的 volume

# 启动
docker compose up -d
```

### 更新到最新版本

```bash
cd Oasisic-Downloader
git pull
docker compose up -d --build
```

---

## 🚀 传统部署（Debian / Ubuntu）

```bash
# 克隆
git clone https://github.com/Hawaiine/oasisic-downloader.git
cd Oasisic-Downloader

# 一键安装（需要 root / sudo）
sudo ./install.sh

# 或手动：
npm install --production
cd client && npm install && npm run build && cd ..
node server/index.js
```

安装过程会询问：

1. **服务端口**（默认 3000）
2. **Spotify API 凭证**（可选，用于歌词匹配辅助）

安装完成后访问 `http://服务器IP:端口`

---

## 🛠 管理命令

传统部署后，任意位置运行：

```bash
oasisic-downloader
```

```
# 🧲 Oasisic Downloader  管理工具

── 日常操作 ──────────────────────────────────
 1) 🔄  更新 yt-dlp 到最新版
 2) 🔌  修改端口号
 3) 🎵  配置 Spotify API
 4) ↺   重启服务
 5) 📊  查看服务状态
 6) 📋  查看实时日志

── 维护 ──────────────────────────────────────
 7) 🔨  重新构建前端
 8) 📦  检查/更新系统依赖
 9) 🗑   一键卸载
```

Docker 部署则使用：

```bash
docker compose logs -f      # 查看日志
docker compose restart       # 重启
docker compose down          # 停止
```

---

## ⚙️ 配置文件

| 文件 | 说明 |
|------|------|
| `server/.env` | 端口、Spotify/Apple Music 凭证 |
| `server/cookies.txt` | 浏览器导出的 YouTube Cookie（可选） |
| `docker-compose.yml` | Docker 环境变量和卷挂载 |

```env
# server/.env
PORT=3000
NODE_ENV=production
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
APPLE_MUSIC_TOKEN=
```

---

## 🧩 技术栈

```
Frontend          React 18 + Vite 5 + Socket.IO Client
Backend           Express 4 + Socket.IO 4
Download Engine   yt-dlp + aria2c + ffmpeg
Image Processing  sharp (封面裁剪)
Deployment        Docker / PM2
```

---

## 📂 项目结构

```
Oasisic-Downloader/
├── server/                  # Node.js 后端
│   ├── index.js             # Express + Socket.IO 入口
│   ├── config.js            # 配置加载 + 二进制路径检测
│   ├── routes/              # API 路由
│   │   ├── info.js          # GET  /api/info
│   │   ├── download.js      # POST /api/download
│   │   ├── lyrics.js        # GET  /api/lyrics
│   │   └── batch.js         # POST /api/batch
│   └── services/            # 业务逻辑
│       ├── ytdlp.js         # yt-dlp 下载引擎
│       ├── queue.js         # 任务队列
│       ├── cover.js         # 封面处理
│       ├── lyrics.js        # 歌词搜索引擎（5个源头）
│       ├── enrichment.js    # 元数据增强
│       └── zhConvert.js     # 繁→简中文
├── client/                  # React 前端 (Vite)
│   └── src/
│       ├── App.jsx          # 主应用
│       ├── components/      # UI 组件 (7个)
│       └── hooks/           # 自定义 hooks
├── scripts/
│   └── oasisic.sh           # 管理命令模板
├── install.sh               # 安装脚本
├── Dockerfile               # Docker 构建
├── docker-compose.yml       # Docker 编排（本地构建）
├── docker-compose.pull.yml  # Docker 编排（Hub 拉取）
├── DOCKER.md                # Docker 部署指南
└── .github/workflows/       # CI/CD 自动构建
```

---

## 🔍 常见问题

<details>
<summary><b>❓ 下载失败 "YouTube 要求验证身份"</b></summary>

**原因**：YouTube 检测到自动化请求。

**解决**：

1. 在浏览器安装 "Get cookies.txt" 扩展
2. 登录 youtube.com，导出 cookies
3. 将 `cookies.txt` 放到项目 `server/` 目录
4. 重启服务

```bash
# Docker
docker compose restart

# 传统部署
oasisic-downloader → 重启服务
```

</details>

<details>
<summary><b>❓ 下载速度很慢</b></summary>

Oasisic Downloader 默认使用 aria2c 16 并发连接加速。如果网络环境限制了 YouTube，请尝试：

1. 确保服务器有良好的国际网络连接
2. 配置代理环境变量

```bash
# Docker 中添加：
environment:
  - HTTP_PROXY=http://你的代理:端口
  - HTTPS_PROXY=http://你的代理:端口
```

</details>

<details>
<summary><b>❓ 播放列表解析失败</b></summary>

- 私有/未公开播放列表需要 `cookies.txt`
- 大型播放列表（200+ 首）需要更长的加载时间
- 某些地区受限制的曲目会被自动跳过（`--ignore-errors`）

</details>

<details>
<summary><b>❓ Docker 构建太慢</b></summary>

首次构建约 3-5 分钟。后续更新只需要：

```bash
docker compose up -d --build
```

Docker 会缓存中间层，增量构建仅需 10-30 秒。如果经常更新，可以配置 GitHub Actions 自动构建并推送到 Docker Hub。

</details>

---

## 🏗 项目结构

```
Oasisic-Downloader/
├── server/                # Node.js 后端
│   ├── index.js           # Express + Socket.IO 入口
│   ├── config.js          # 配置加载 + 二进制路径检测
│   ├── routes/
│   │   ├── info.js        # GET /api/info — 视频/播放列表信息
│   │   ├── download.js    # POST /api/download + 文件流下载
│   │   ├── lyrics.js      # GET /api/lyrics — 多源歌词搜索
│   │   └── batch.js       # POST /api/batch — 打包下载
│   └── services/
│       ├── ytdlp.js       # yt-dlp 封装（下载/解析/反检测）
│       ├── queue.js       # 任务队列管理
│       ├── cover.js       # 封面抓取 + 裁剪 + 嵌入
│       ├── lyrics.js      # 歌词搜索引擎
│       └── zhConvert.js   # 繁→简中文转换
├── client/                # React 前端
│   └── src/
│       ├── App.jsx        # 主应用
│       ├── api.js         # API 请求封装
│       ├── components/    # UI 组件
│       └── hooks/         # 自定义 hooks
├── Dockerfile             # Docker 构建
├── docker-compose.yml     # Docker 编排
├── install.sh             # 一键安装脚本
└── ecosystem.config.js    # PM2 配置
```

---

## 📸 Screenshots

（可在此处加入截图）

```
┌─────────────────────────────────────┐
│  🧲 Oasisic Downloader  YouTube 音视频下载器 │
│  ● 运行中    [🌙 深色模式 ▼]        │
├─────────────────────────────────────┤
│  🔗 [https://youtube.com/...] [解析]│
│                                     │
│  ┌─ 视频信息 ────────────────────┐  │
│  │ 🖼  视频标题                  │  │
│  │ 👤  Updloader  ⏱ 3:45        │  │
│  └───────────────────────────────┘  │
│                                     │
│  ┌─ 下载选项 ────────────────────┐  │
│  │ [🎵音频] [🎬视频]             │  │
│  │ FLAC ALAC M4A MP3 WAV AAC     │  │
│  └───────────────────────────────┘  │
│                                     │
│  [▶ 开始下载]                       │
└─────────────────────────────────────┘
```

---

## 🤝 致谢

- [yt-dlp](https://github.com/yt-dlp/yt-dlp) — 强大的下载引擎
- [LRCLib](https://lrclib.net) — 开源歌词库
- [网易云音乐](https://music.163.com) — 中文歌词来源
- [Lucide Icons](https://lucide.dev) — 清爽的图标

---

## 📄 License

MIT# Auto-trigger Docker build
