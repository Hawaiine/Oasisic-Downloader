#!/usr/bin/env bash
# ============================================================
# Oasisic Downloader — 一键安装脚本
# 用法: sudo ./install.sh
# 平台: Debian 12+ / Ubuntu 22.04+
# ============================================================
set -euo pipefail

R='\033[0;31m' G='\033[0;32m' Y='\033[1;33m' C='\033[0;36m' B='\033[1m' N='\033[0m'
ok()   { echo -e " ${G}✅${N}  $*"; }
fail() { echo -e " ${R}❌  $*${N}" >&2; exit 1; }
warn() { echo -e " ${Y}⚠️  $*${N}"; }
info() { echo -e " ${C}ℹ️  $*${N}"; }
step() { echo -e "\n${B}━━━  $*  ━━━${N}"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/server/.env"
YTDLP_BIN="/usr/local/bin/yt-dlp"
PM2_PROC="oasisic-downloader"
START=$(date +%s)

# ─── 1. 收集参数 ──────────────────────────────────────────────
clear 2>/dev/null || true
echo ""
echo "  ╔══════════════════════════════════════════╗"
echo "  ║   🧲 Oasisic Downloader  安装向导        ║"
echo "  ╚══════════════════════════════════════════╝"
echo "  目录: ${SCRIPT_DIR}"

# 端口
DEF_PORT="3000"
[ -f "$ENV_FILE" ] && DEF_PORT="$(grep -E '^PORT=' "$ENV_FILE" | tail -1 | cut -d= -f2 | tr -d ' ')"
read -r -p "  → 端口 (默认 ${DEF_PORT}): " _P
PORT="${_P:-$DEF_PORT}"
[[ "$PORT" =~ ^[0-9]+$ ]] && [ "$PORT" -ge 1 ] && [ "$PORT" -le 65535 ] || fail "无效端口"

# Spotify (可选)
EXIST_ID=""; EXIST_SEC=""
[ -f "$ENV_FILE" ] && { EXIST_ID="$(grep -E '^SPOTIFY_CLIENT_ID=' "$ENV_FILE" | cut -d= -f2 | tr -d ' ')"; EXIST_SEC="$(grep -E '^SPOTIFY_CLIENT_SECRET=' "$ENV_FILE" | cut -d= -f2 | tr -d ' ')"; }
if [ -n "$EXIST_ID" ]; then
  SPOT_ID="$EXIST_ID"; SPOT_SEC="$EXIST_SEC"
  ok "Spotify 凭证已存在"
else
  echo ""; echo "  Spotify API (可选，回车跳过)"
  read -r -p "  → Client ID: " SPOT_ID
  read -r -p "  → Secret: " SPOT_SEC
fi

read -r -p "  → 开始安装？[Y/n]: " _GO
[[ "${_GO,,}" == "n" ]] && exit 0

# ─── 2. 系统依赖 ──────────────────────────────────────────────
step "1/5 · 系统依赖"
apt-get update -qq
for pkg in curl ffmpeg aria2 python3 python3-pip; do
  dpkg -s "$pkg" &>/dev/null && skip "$pkg 已存在" || { apt-get install -y -qq "$pkg" && ok "$pkg"; }
done
python3 -c "import mutagen" 2>/dev/null && skip "mutagen 已存在" \
  || { pip3 install -q --break-system-packages mutagen 2>/dev/null && ok "mutagen"; }

# ─── 3. Node.js ────────────────────────────────────────────────
step "2/5 · Node.js"
if command -v node &>/dev/null && [ "$(node --version | tr -d v | cut -d. -f1)" -ge 18 ]; then
  skip "Node.js $(node --version) 已满足"
else
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - &>/dev/null
  apt-get install -y -qq nodejs && ok "Node.js $(node --version)"
fi

# ─── 4. yt-dlp ─────────────────────────────────────────────────
step "3/5 · yt-dlp"
if [ -x "$YTDLP_BIN" ] && "$YTDLP_BIN" --version &>/dev/null; then
  skip "yt-dlp $("$YTDLP_BIN" --version) 已存在"
else
  curl -fsSL --connect-timeout 15 --max-time 60 "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp" -o "$YTDLP_BIN" \
    && chmod +x "$YTDLP_BIN" && ok "yt-dlp $("$YTDLP_BIN" --version)" \
    || fail "yt-dlp 下载失败，请检查网络"
fi

# ─── 5. PM2 + 后端 + 前端 ────────────────────────────────────
step "4/5 · 运行时"
command -v pm2 &>/dev/null && skip "PM2 $(pm2 --version) 已存在" \
  || { npm install -g pm2 -q && ok "PM2"; }

[ -d node_modules ] && skip "后端依赖已存在" \
  || { npm install --production --no-audit --no-fund && ok "后端依赖"; }

CLIENT_DIR="$SCRIPT_DIR/client"
if [ -d "$CLIENT_DIR/dist" ] && [ -f "$CLIENT_DIR/dist/index.html" ]; then
  skip "前端已构建"
else
  (cd "$CLIENT_DIR" && npm install --no-audit --no-fund && npm run build) && ok "前端构建完成"
fi

# ─── 6. 部署 ──────────────────────────────────────────────────
step "5/5 · 部署"
mkdir -p downloads tmp logs
if [ ! -f "$ENV_FILE" ]; then
  cat > "$ENV_FILE" << EOF
PORT=${PORT}
NODE_ENV=production
SPOTIFY_CLIENT_ID=${SPOT_ID}
SPOTIFY_CLIENT_SECRET=${SPOT_SEC}
EOF
  ok ".env 已创建"
fi

for old in ytdl-server oasisic-downloader; do
  pm2 list 2>/dev/null | grep -qw "$old" || continue
  pm2 stop "$old" --silent 2>/dev/null || true
  pm2 delete "$old" --silent 2>/dev/null || true
done
pm2 start ecosystem.config.js && pm2 save && ok "服务已启动"

# 管理命令
cp scripts/oasisic.sh /usr/local/bin/oasisic && chmod +x /usr/local/bin/oasisic && ok "oasisic 管理命令"

# 定时更新 yt-dlp
crontab -l 2>/dev/null | grep -qF "$YTDLP_BIN -U" \
  || (crontab -l 2>/dev/null; echo "0 3 * * * $YTDLP_BIN -U >> /var/log/ytdlp-update.log 2>&1") | crontab -

# ─── 完成 ──────────────────────────────────────────────────────
IP="$(hostname -I 2>/dev/null | awk '{print $1}' || echo localhost)"
echo ""
echo "  ╔══════════════════════════════════════════╗"
echo "  ║   ✅ 安装完成！($(( $(date +%s) - START ))秒)        ║"
echo "  ╚══════════════════════════════════════════╝"
echo ""
echo "  🌐  http://${IP}:${PORT}"
echo "  🛠  oasisic          — 管理命令"