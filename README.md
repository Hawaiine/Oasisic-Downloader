# 🎵 Oasisic Downloader

> YouTube 高品质音视频下载系统 · 自托管 · 无广告 · 无限制

单曲 / 播放列表批量下载，自动写入元数据与封面，内置多源歌词搜索，实时进度推送，支持随时取消。

---

## ✨ 功能特性

| 功能 | 说明 |
|------|------|
| 🎵 **音频下载** | FLAC · ALAC · M4A · MP3 · WAV · AAC · Opus 七种格式 |
| 🎬 **视频下载** | 4K / 2K / 1080p / 720p，MP4 / MKV |
| 📋 **播放列表** | 勾选下载，实时进度 + 日志，每首完成后独立保存 |
| ❌ **取消下载** | 任意时刻取消，立即终止 yt-dlp 进程 |
| 🖼 **封面预览** | React Portal 全屏浮层，最高清 maxresdefault，可保存 |
| 🏷 **元数据** | 标题 / 艺术家 / 专辑 / 年份，繁→简中文自动转换 |
| 🎤 **歌词搜索** | 网易云 → LRCLib → Apple Music → Spotify 多源依次 |
| 🎧 **播放器队列** | 下载后自动入队，上/下曲，双击跳转，自动续播 |
| ⚡ **实时进度** | WebSocket 推送速度 / ETA / 百分比 |
| 🌙 **主题切换** | 深色 / 浅色 / 跟随系统 |

---

## 📦 系统要求

- Debian 12/13 或 Ubuntu 22.04/24.04（其他 apt 系发行版大概率兼容）
- 至少 512 MB RAM，1 GB 磁盘空间
- 以 root 或具有 sudo 权限的用户运行

---

## 🚀 快速部署

```bash
# 解压
tar -xzf oasisic-downloader.tar.gz
cd oasisic-downloader

# 一键安装（约 2-5 分钟）
sudo ./install.sh
```

安装过程会询问：
- **服务端口**（默认 3000，直接回车使用）
- **Spotify API 凭证**（可选，直接回车跳过）

安装完成后访问：`http://服务器IP:端口`

---

## 🛠 oasisic 管理命令

安装完成后，任意位置运行：

```bash
oasisic
```

```
Oasisic Downloader  管理工具

 1)  更新 yt-dlp
 2)  修改端口号
 3)  配置 Spotify API
 4)  重启服务
 5)  查看服务状态
 6)  查看实时日志
 7)  重新构建前端
 8)  检查/更新系统依赖 (ffmpeg / aria2 / Node.js / PM2)
 9)  一键卸载本项目
 0)  退出
```

---

## ⚙️ 配置文件

安装后配置文件位于 `server/.env`：

```env
PORT=3000
NODE_ENV=production

# Spotify API（可选，辅助歌词搜索）
# 获取：https://developer.spotify.com/dashboard → Create App（免费）
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=

# Apple Music API（可选，需 Apple Developer 账号，年费约 $99）
# APPLE_MUSIC_TOKEN=
```

修改后运行 `oasisic → 4) 重启服务` 使配置生效。

---

## 🤖 解决 YouTube Bot 检测

下载时若出现 `Sign in to confirm you're not a bot` 错误：

**方法一（推荐）— yt-dlp 直接从浏览器导出：**
```bash
# 在已登录 YouTube 的本地机器上执行
yt-dlp --cookies-from-browser chrome -o /dev/null https://www.youtube.com
# 上传到服务器
scp cookies.txt user@server:/安装目录/server/cookies.txt
```

**方法二 — Chrome 扩展手动导出：**
1. 安装 [Get cookies.txt LOCALLY](https://chrome.google.com/webstore/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc) 扩展
2. 登录 YouTube，点击扩展图标导出 cookies.txt
3. 上传到服务器 `server/cookies.txt`

Cookie 文件放置后自动生效，无需重启服务。

---

## 🎵 配置 Spotify API（可选）

用于歌词搜索时辅助确认曲目信息（**注意：Spotify 公开 API 不提供歌词正文**）：

1. 访问 [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
2. 登录后点击 **Create App**，Redirect URI 填 `http://localhost`
3. 在设置页获取 **Client ID** 和 **Client Secret**
4. 运行 `oasisic → 3) 配置 Spotify API` 填入

---

## 🔧 技术栈

**后端**

| 组件 | 版本 | 作用 |
|------|------|------|
| Node.js | 18+ | 运行时 |
| Express | 4.x | HTTP API |
| Socket.IO | 4.x | WebSocket 实时进度 |
| yt-dlp | latest | 下载核心 |
| FFmpeg | 系统 | 音视频转码、封面嵌入 |
| aria2c | 系统 | 16 线程分片下载加速 |
| sharp | 0.33+ | 封面图裁剪 1000×1000 |
| PM2 | 6.x | 进程管理、开机自启 |

**前端**

| 组件 | 版本 | 作用 |
|------|------|------|
| React | 18 | UI 框架 |
| Vite | 5.x | 构建工具 |
| Socket.IO Client | 4.x | 实时进度接收 |
| lucide-react | 0.4x | 图标库 |

---

## 📁 项目结构

```
oasisic-downloader/
├── install.sh                    # 一键安装脚本（含 oasisic 管理命令生成）
├── ecosystem.config.js           # PM2 配置（自读 .env 注入 PORT）
├── package.json                  # 后端依赖
├── server/
│   ├── index.js                  # Express + Socket.IO 入口
│   ├── config.js                 # 先 dotenv.config() 再读 PORT
│   ├── .env                      # 安装后生成（含 PORT/Spotify 凭证）
│   ├── cookies.txt               # YouTube Cookie（可选，手动放置）
│   ├── routes/
│   │   ├── info.js               # GET /api/info — 视频/播放列表信息
│   │   ├── download.js           # POST /api/download; DELETE /:id 取消; GET /:id/file 流式下载
│   │   └── lyrics.js             # GET /api/lyrics — 多源歌词
│   └── services/
│       ├── ytdlp.js              # yt-dlp 封装（-J 解析列表，onProcStart 取消支持）
│       ├── queue.js              # 任务队列（task.proc 字段，cancelTask 终止进程）
│       ├── cover.js              # 封面获取（maxresdefault）+ sharp 裁剪
│       ├── metadata.js           # FFmpeg 元数据写入
│       ├── lyrics.js             # 多源歌词（网易云/LRCLib/Apple/Spotify）
│       └── zhConvert.js          # 繁→简（2700+ 字映射，含傑→杰、場→场）
└── client/
    ├── vite.config.js
    ├── index.html
    └── src/
        ├── App.jsx               # 根组件（播放队列、playlistTaskIds 隔离）
        ├── api.js                # axios 封装
        ├── index.css             # CSS 变量主题系统
        ├── hooks/useTheme.js     # 三态主题（dark/light/auto）
        └── components/
            ├── URLInput.jsx      # URL 输入（onPaste 自动解析）
            ├── VideoInfo.jsx     # 封面全屏 Portal lightbox
            ├── DownloadOptions.jsx
            ├── ProgressPanel.jsx # 实时进度 + 取消按钮 + 折叠日志
            ├── LyricsPanel.jsx   # 多源歌词（LRC 时间轴 + 翻译）
            ├── PersistentPlayer.jsx # 播放器队列（双击跳转，自动续播）
            └── PlaylistPanel.jsx # 播放列表（稳定 Socket + onTaskCreated 即时回调）
```

---

## 🐛 常见问题

**Q: 修改端口后旧端口仍可访问？**

旧版用 `fuser` 释放端口，但 `fuser` 在 Debian 最小安装中不存在。新版改用 `/proc/net/tcp` 直读内核 TCP 表 + `ss` + `pkill` 三重保险，兼容所有 Linux 环境。

**Q: 安装时 vite build 失败？**

失败时会显示具体错误信息。常见原因：Node.js 版本过低（需 ≥ 18），运行 `oasisic → 8) 检查/更新系统依赖` 升级后重试。

**Q: 播放列表进度显示 0%？**

Socket 监听器重复注册导致事件丢失（已修复：useEffect 空依赖数组 + useRef）。

**Q: 出现 "Sign in to confirm you're not a bot"？**

按上方 Cookie 章节配置 `server/cookies.txt`，配置后自动生效。

**Q: 繁体字文件名没有转换为简体？**

`zhConvert.js` 内嵌 2700+ 字映射。如遇未覆盖的字，可在 `T2S_MAP` 手动添加。

---

## 📄 License

MIT License — 自由使用、修改、分发，保留原始声明即可。

---

## 🙏 致谢

- [yt-dlp](https://github.com/yt-dlp/yt-dlp) — 核心下载引擎
- [FFmpeg](https://ffmpeg.org) — 音视频处理
- [aria2](https://aria2.github.io) — 多线程下载加速
- [网易云音乐 API](https://music.163.com) — 中文歌词数据
- [LRCLib](https://lrclib.net) — 开源歌词库
