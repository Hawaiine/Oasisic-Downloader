#!/usr/bin/env bash
# =============================================================================
# Oasisic Downloader — 安装脚本
# 平台: Debian 12/13 · Ubuntu 22.04/24.04
# 用法: chmod +x install.sh && sudo ./install.sh
# =============================================================================
set -euo pipefail
IFS=$'\n\t'

# ── 颜色 ──────────────────────────────────────────────────────────────────────
R='\033[0;31m' G='\033[0;32m' Y='\033[1;33m' C='\033[0;36m' B='\033[1m' N='\033[0m'
ok()   { echo -e "${G}  ✓${N}  $*"; }
fail() { echo -e "${R}  ✗  $*${N}" >&2; exit 1; }
warn() { echo -e "${Y}  !${N}  $*"; }
info() { echo -e "${C}  →${N}  $*"; }
step() { echo -e "\n${B}${C}━━━  $*  ━━━${N}"; }
run_q() {
  local label="$1"; shift
  printf "      %-36s" "${label}..."
  if "$@" >/dev/null 2>&1; then echo -e " ${G}✓${N}"
  else echo -e " ${R}✗ 失败${N}"; return 1; fi
}
ver_gte() { printf '%s\n%s\n' "$2" "$1" | sort -V -C; }

# ── 基础变量 ──────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
ENV_FILE="$SCRIPT_DIR/server/.env"
YTDLP_BIN="/usr/local/bin/yt-dlp"
PM2_PROC="oasisic-downloader"
OASISIC_CMD="/usr/local/bin/oasisic"
APT_DONE=0

apt_once() {
  [ "$APT_DONE" -eq 1 ] && return
  run_q "apt-get update" apt-get update; APT_DONE=1
}
pkg_install() {
  dpkg -s "$1" >/dev/null 2>&1 && { ok "$1 已安装"; return; }
  apt_once
  run_q "安装 $1" apt-get install -y "$1" && ok "$1 安装完成"
}

# =============================================================================
# Banner
# =============================================================================
echo ""
echo -e "${B}${C}  Oasisic Downloader${N}  安装向导"
echo -e "  YouTube 高品质音视频下载系统"
echo -e "${C}  ──────────────────────────────────────────${N}"
echo ""
echo -e "  📁 安装目录: ${C}${SCRIPT_DIR}${N}"
echo ""

# =============================================================================
step "配置 · 安装前收集所有参数，之后全程自动"
# =============================================================================

# ── 端口 ──────────────────────────────────────────────────────────────────────
EXIST_PORT=""
[ -f "$ENV_FILE" ] && EXIST_PORT="$(grep -E '^PORT=' "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2 | tr -d ' ' || true)"
DEF_PORT="${EXIST_PORT:-3000}"

echo -e "  ${B}🔌 服务端口${N}  (默认 ${C}${DEF_PORT}${N}，直接回车使用默认值)"
read -r -p "  端口号: " _IN_PORT
CHOSEN_PORT="${_IN_PORT:-$DEF_PORT}"
[[ "$CHOSEN_PORT" =~ ^[0-9]+$ ]] && [ "$CHOSEN_PORT" -ge 1 ] && [ "$CHOSEN_PORT" -le 65535 ] \
  || fail "端口号无效: $CHOSEN_PORT"
ok "端口: ${C}${CHOSEN_PORT}${N}"

# 端口占用检测
CON_PID=""
command -v ss &>/dev/null && CON_PID="$(ss -tlnp "sport = :${CHOSEN_PORT}" 2>/dev/null | grep -oP 'pid=\K[0-9]+' | head -1 || true)"
if [ -n "$CON_PID" ]; then
  CON_CMD="$(ps -p "$CON_PID" -o comm= 2>/dev/null || echo '未知')"
  warn "端口 ${CHOSEN_PORT} 已被占用  进程: ${CON_CMD} (PID: ${CON_PID})"
  read -r -p "  强制终止占用进程？[y/N]: " _K
  if [[ "${_K,,}" == "y" ]]; then
    kill -TERM "$CON_PID" 2>/dev/null || true; sleep 2
    kill -0 "$CON_PID" 2>/dev/null && { kill -KILL "$CON_PID" 2>/dev/null || true; sleep 1; }
    ok "占用进程已终止"
  else
    fail "请先释放端口 ${CHOSEN_PORT} 后重新安装"
  fi
fi
echo ""

# ── Spotify（可选）────────────────────────────────────────────────────────────
EXIST_SPOT_ID=""
EXIST_SPOT_SEC=""
[ -f "$ENV_FILE" ] && EXIST_SPOT_ID="$(grep -E '^SPOTIFY_CLIENT_ID=' "$ENV_FILE" 2>/dev/null | cut -d= -f2 | tr -d ' ' || true)"
[ -f "$ENV_FILE" ] && EXIST_SPOT_SEC="$(grep -E '^SPOTIFY_CLIENT_SECRET=' "$ENV_FILE" 2>/dev/null | cut -d= -f2 | tr -d ' ' || true)"

if [ -n "$EXIST_SPOT_ID" ]; then
  SPOT_ID="$EXIST_SPOT_ID"; SPOT_SEC="$EXIST_SPOT_SEC"
  ok "Spotify 凭证已存在（保留，可通过 ${C}oasisic${N} 管理命令修改）"
else
  echo -e "  ${B}🎵 Spotify API（可选）${N}"
  echo -e "     用途: 辅助歌词搜索时匹配曲目（不提供歌词内容本身）"
  echo -e "     获取: ${C}https://developer.spotify.com/dashboard${N}"
  echo -e "            → 登录 → Create App → 复制 Client ID 和 Client Secret"
  echo -e "  ${Y}  提示: 不填写不影响下载功能，直接回车跳过即可${N}"
  read -r -p "  Spotify Client ID     (回车跳过): " SPOT_ID
  read -r -p "  Spotify Client Secret (回车跳过): " SPOT_SEC
  [ -n "$SPOT_ID" ] && ok "Spotify 凭证已填写" || info "Spotify 已跳过"
fi
echo ""

SPOT_STATUS="$([ -n "$SPOT_ID" ] && echo '已配置 ✓' || echo '跳过')"
echo ""
echo -e "  ${B}配置摘要${N}"
echo -e "  ${C}  端口    : ${N}${CHOSEN_PORT}"
echo -e "  ${C}  Spotify : ${N}${SPOT_STATUS}"
echo ""
read -r -p "  确认以上配置，开始安装？[Y/n]: " _GO
[[ "${_GO,,}" == "n" ]] && { echo "安装已取消"; exit 0; }
echo ""

# =============================================================================
step "1 · 系统依赖"
# =============================================================================
for pkg in curl ffmpeg aria2 python3 python3-pip; do pkg_install "$pkg"; done
# mutagen: required by yt-dlp for metadata embedding (--embed-metadata, --embed-thumbnail)
printf "      %-36s" "python3 mutagen..."
python3 -c "import mutagen" 2>/dev/null && echo -e " ${G}✓ 已安装${N}" || {
  pip3 install --quiet --break-system-packages mutagen 2>/dev/null     || pip3 install --quiet mutagen 2>/dev/null || true
  python3 -c "import mutagen" 2>/dev/null     && echo -e " ${G}✓${N}"     || echo -e " ${Y}⚠ 安装失败（可手动运行: pip3 install mutagen）${N}"
}

# =============================================================================
step "2 · Node.js (≥ 18)"
# =============================================================================
NODE_OK=0
command -v node &>/dev/null && NODE_VER="$(node --version | tr -d 'v')" && \
  ver_gte "$NODE_VER" "18.0.0" && ok "Node.js ${NODE_VER} 已满足要求" && NODE_OK=1

if [ "$NODE_OK" -eq 0 ]; then
  command -v node &>/dev/null && warn "Node.js $(node --version | tr -d 'v') 版本过低，升级为 22 LTS" || info "安装 Node.js 22 LTS..."
  run_q "添加 NodeSource 源" bash -c 'curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null 2>&1'
  run_q "安装 nodejs"        apt-get install -y nodejs
  ok "Node.js $(node --version) 安装完成"
fi

# =============================================================================
step "3 · yt-dlp"
# =============================================================================
YTDLP_BEFORE="$( [ -x "$YTDLP_BIN" ] && "$YTDLP_BIN" --version 2>/dev/null || echo '未安装' )"

# 安装/更新策略（三级降级，确保总能成功）：
# 1. GitHub releases 直接下载（最新版，推荐）
# 2. pip3 安装（GitHub 不可访问时的备选）
# 3. apt 安装（版本可能较旧，但总是可用）
YTDLP_OK=0

printf "      %-36s" "方式1: GitHub 下载..."
# /usr/local/bin 需要 root 写权限，统一用函数处理
_ytdlp_curl() {
  if [ "$(id -u)" -eq 0 ]; then
    curl -fsSL --connect-timeout 15 --max-time 120 \
      "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp" \
      -o "$YTDLP_BIN"
  else
    # 先下载到临时文件，再 sudo 移入目标位置
    local _tmp; _tmp="$(mktemp)"
    curl -fsSL --connect-timeout 15 --max-time 120 \
      "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp" \
      -o "$_tmp" && sudo mv "$_tmp" "$YTDLP_BIN" || { rm -f "$_tmp"; return 1; }
  fi
}
if _ytdlp_curl 2>/dev/null && [ -s "$YTDLP_BIN" ]; then
  [ "$(id -u)" -eq 0 ] && chmod +x "$YTDLP_BIN" || sudo chmod +x "$YTDLP_BIN"
  "$YTDLP_BIN" --version &>/dev/null && YTDLP_OK=1
fi
[ "$YTDLP_OK" -eq 1 ] && echo -e " ${G}✓${N}" || echo -e " ${Y}跳过${N}"

if [ "$YTDLP_OK" -eq 0 ]; then
  printf "      %-36s" "方式2: pip3 安装..."
  if command -v pip3 &>/dev/null || apt-get install -y python3-pip -qq &>/dev/null; then
    pip3 install --quiet --break-system-packages yt-dlp 2>/dev/null       || pip3 install --quiet yt-dlp 2>/dev/null || true
    YT_PIP="$(python3 -m yt_dlp --version 2>/dev/null | head -1 || true)"
    if [ -n "$YT_PIP" ]; then
      # Create wrapper so it's accessible as /usr/local/bin/yt-dlp
      echo '#!/bin/sh' > "$YTDLP_BIN"
      echo 'exec python3 -m yt_dlp "$@"' >> "$YTDLP_BIN"
      chmod +x "$YTDLP_BIN"
      "$YTDLP_BIN" --version &>/dev/null && YTDLP_OK=1
    fi
  fi
  [ "$YTDLP_OK" -eq 1 ] && echo -e " ${G}✓${N}" || echo -e " ${Y}跳过${N}"
fi

if [ "$YTDLP_OK" -eq 0 ]; then
  printf "      %-36s" "方式3: apt 安装..."
  apt-get install -y yt-dlp -qq 2>/dev/null && YTDLP_OK=1 || true
  [ "$YTDLP_OK" -eq 1 ] && echo -e " ${G}✓${N}" || echo -e " ${R}✗ 失败${N}"
fi

[ "$YTDLP_OK" -eq 0 ] && fail "yt-dlp 安装失败，请检查网络连接后重试"

YTDLP_AFTER="$("$YTDLP_BIN" --version 2>/dev/null || echo '?')"
[ "$YTDLP_BEFORE" = "$YTDLP_AFTER" ]   && ok "yt-dlp ${YTDLP_AFTER} 已是最新"   || ok "yt-dlp: ${YTDLP_BEFORE} → ${YTDLP_AFTER}"

# =============================================================================
step "4 · PM2 进程管理器"
# =============================================================================
command -v pm2 &>/dev/null && ok "PM2 $(pm2 --version) 已安装" || {
  run_q "npm install -g pm2" npm install -g pm2
  ok "PM2 $(pm2 --version) 安装完成"
}

# =============================================================================
step "5 · 后端 npm 依赖"
# =============================================================================
[ -f "package.json" ] || fail "未找到 package.json，请在项目根目录运行"
run_q "npm install" npm install --production
ok "后端依赖安装完成"

# =============================================================================
step "6 · 前端构建 (React + Vite)"
# =============================================================================
CLIENT_DIR="$SCRIPT_DIR/client"
DIST_DIR="$CLIENT_DIR/dist"
BUILD_NEEDED=1
if [ -d "$DIST_DIR" ] && [ -f "$DIST_DIR/index.html" ]; then
  NEWER="$(find "$CLIENT_DIR/src" -newer "$DIST_DIR/index.html" 2>/dev/null | wc -l)"
  [ "$NEWER" -eq 0 ] && ok "前端已是最新，跳过构建" && BUILD_NEEDED=0 \
    || info "${NEWER} 个文件有更新，重新构建"
fi
if [ "$BUILD_NEEDED" -eq 1 ]; then
  run_q "npm install (前端)" bash -c "cd '$CLIENT_DIR' && npm install"
  # Run build with error output captured for debugging
  BUILD_LOG="$(cd "$CLIENT_DIR" && npm run build 2>&1)"
  if echo "$BUILD_LOG" | grep -q "built in\|vite v" ; then
    ok "前端构建完成 → client/dist/"
  elif [ -f "$DIST_DIR/index.html" ]; then
    ok "前端构建完成 → client/dist/"
  else
    echo ""
    echo -e "${R}  ✗  前端构建失败，错误信息:${N}"
    echo "$BUILD_LOG" | tail -20 | sed 's/^/    /'
    fail "前端构建失败，请检查以上错误"
  fi
fi

# =============================================================================
step "7 · 工作目录"
# =============================================================================
for dir in downloads tmp logs; do mkdir -p "$SCRIPT_DIR/$dir"; done
RUN_USER="${SUDO_USER:-root}"
chown -R "$RUN_USER":"$RUN_USER" "$SCRIPT_DIR/downloads" "$SCRIPT_DIR/tmp" "$SCRIPT_DIR/logs" 2>/dev/null || true
ok "downloads/ tmp/ logs/ 就绪  归属: ${RUN_USER}"

# =============================================================================
step "8 · 环境配置 (.env)"
# =============================================================================
mkdir -p "$(dirname "$ENV_FILE")"
if [ ! -f "$ENV_FILE" ]; then
  cat > "$ENV_FILE" << _EV
# Oasisic Downloader — 服务器环境变量
PORT=${CHOSEN_PORT}
NODE_ENV=production
SPOTIFY_CLIENT_ID=${SPOT_ID}
SPOTIFY_CLIENT_SECRET=${SPOT_SEC}
# Apple Music (需 Apple Developer 账号 99$/年，获取: developer.apple.com → MusicKit Key)
# APPLE_MUSIC_TOKEN=
_EV
  ok ".env 创建完成"
else
  _CHG=0
  if grep -qE '^PORT=' "$ENV_FILE"; then
    OLD_P="$(grep -E '^PORT=' "$ENV_FILE" | head -1 | cut -d= -f2 | tr -d ' ')"
    if [ "$OLD_P" != "$CHOSEN_PORT" ]; then
      sed -i "s/^PORT=.*/PORT=${CHOSEN_PORT}/" "$ENV_FILE"
      ok "端口更新: ${OLD_P} → ${CHOSEN_PORT}"; _CHG=1
    else
      ok "端口无变化 (${CHOSEN_PORT})"
    fi
  else
    sed -i "1s/^/PORT=${CHOSEN_PORT}\n/" "$ENV_FILE"; _CHG=1
  fi
  if [ -n "$SPOT_ID" ] && [ "$SPOT_ID" != "$EXIST_SPOT_ID" ]; then
    grep -qE '^SPOTIFY_CLIENT_ID='     "$ENV_FILE" \
      && sed -i "s/^SPOTIFY_CLIENT_ID=.*/SPOTIFY_CLIENT_ID=${SPOT_ID}/"         "$ENV_FILE" \
      || echo "SPOTIFY_CLIENT_ID=${SPOT_ID}"     >> "$ENV_FILE"
    grep -qE '^SPOTIFY_CLIENT_SECRET=' "$ENV_FILE" \
      && sed -i "s/^SPOTIFY_CLIENT_SECRET=.*/SPOTIFY_CLIENT_SECRET=${SPOT_SEC}/" "$ENV_FILE" \
      || echo "SPOTIFY_CLIENT_SECRET=${SPOT_SEC}" >> "$ENV_FILE"
    ok "Spotify 凭证更新"; _CHG=1
  fi
  [ "$_CHG" -eq 0 ] && info ".env 无需变更" || true
fi

# =============================================================================
step "9 · PM2 服务启动"
# =============================================================================
# 停止所有旧进程（兼容旧名称 ytdl-server）
for _old_proc in ytdl-server oasisic-downloader; do
  pm2 list 2>/dev/null | grep -qw "$_old_proc" || continue
  pm2 stop   "$_old_proc" --silent 2>/dev/null || true
  pm2 delete "$_old_proc" --silent 2>/dev/null || true
done

run_q "pm2 start"  pm2 start "$SCRIPT_DIR/ecosystem.config.js"
run_q "pm2 save"   pm2 save
ok "服务已启动  进程: ${C}${PM2_PROC}${N}  端口: ${C}${CHOSEN_PORT}${N}"

# 开机自启（静默）
_STARTUP="$(pm2 startup 2>&1 | grep '^sudo' | head -1 || true)"
[ -n "$_STARTUP" ] && { eval "$_STARTUP" >/dev/null 2>&1 && ok "PM2 开机自启已配置" \
  || warn "开机自启失败（非致命），手动运行: ${_STARTUP}"; } || ok "PM2 开机自启已配置"

# =============================================================================
step "10 · Cron 自动更新 yt-dlp"
# =============================================================================
CRON_JOB="0 3 * * * ${YTDLP_BIN} -U >> /var/log/ytdlp-update.log 2>&1"
crontab -l 2>/dev/null | grep -qF "${YTDLP_BIN} -U" \
  && ok "yt-dlp 自动更新 cron 已存在（跳过）" \
  || { ( crontab -l 2>/dev/null; echo "$CRON_JOB" ) | crontab -; ok "每日 03:00 自动更新 yt-dlp"; }

# =============================================================================
step "11 · 注册 oasisic 管理命令"
# =============================================================================
info "生成 ${OASISIC_CMD} ..."

# ── 纯 bash：单引号 HEREDOC 写模板（无变量展开），再 sed 替换占位符 ──────────
# 这是唯一不会产生乱码的方法：单引号 marker 阻止 bash 展开任何 $ 变量
OASISIC_TMP="$(mktemp /tmp/oasisic.XXXXXX)"

cat > "$OASISIC_TMP" << '__TPL__'
#!/usr/bin/env bash
# oasisic — Oasisic Downloader 管理工具（由 install.sh 自动生成）

INSTALL_DIR="@@INSTALL_DIR@@"
YTDLP_BIN="@@YTDLP_BIN@@"
ENV_FILE="@@ENV_FILE@@"
PM2_PROC="@@PM2_PROC@@"

R='\033[0;31m' G='\033[0;32m' Y='\033[1;33m' C='\033[0;36m' B='\033[1m' N='\033[0m'
ok()   { echo -e "  ${G}✓${N}  $*"; }
warn() { echo -e "  ${Y}!${N}  $*"; }
info() { echo -e "  ${C}→${N}  $*"; }
err()  { echo -e "  ${R}✗${N}  $*"; }

get_port() { grep -E '^PORT=' "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2 | tr -d ' ' || echo 3000; }

pm2_restart() {
  pm2 stop   "$PM2_PROC" --silent 2>/dev/null || true
  pm2 delete "$PM2_PROC" --silent 2>/dev/null || true
  pm2 start  "$INSTALL_DIR/ecosystem.config.js" >/dev/null 2>&1
  pm2 save   >/dev/null 2>&1
}

show_menu() {
  local PORT; PORT="$(get_port)"
  clear 2>/dev/null || printf '\033[2J\033[H'
  echo ""
  echo -e "${B}${C}  Oasisic Downloader${N}  ${C}管理工具${N}"
  echo -e "  ${C}────────────────────────────────────────────${N}"
  echo ""
  echo -e "  进程: ${C}${PM2_PROC}${N}   端口: ${C}${PORT}${N}"
  echo ""
  echo -e "  ${B}── 日常操作 ──────────────────────────────────${N}"
  echo "   1) 🔄  更新 yt-dlp 到最新版"
  echo "   2) 🔌  修改端口号              (当前: ${PORT})"
  echo "   3) 🎵  配置 Spotify API"
  echo "   4) ↺   重启服务"
  echo "   5) 📊  查看服务状态"
  echo "   6) 📋  查看实时日志"
  echo ""
  echo -e "  ${B}── 维护 ──────────────────────────────────────${N}"
  echo "   7) 🔨  重新构建前端"
  echo "   8) 📦  检查并更新系统依赖 (ffmpeg/aria2/Node.js)"
  echo "   9) 🗑   一键卸载本项目"
  echo ""
  echo -e "  ${B}── Docker 相关 ───────────────────────────────${N}"
  echo "   10) 🐳 Docker 完整更新 (git pull + 重建镜像)"
  echo ""
  echo "   0)     退出"
  echo ""
  read -r -p "  请选择 [0-9/10]: " CHOICE
  case "$CHOICE" in
    1) do_update    ;; 2) do_port      ;; 3) do_spotify ;;
    4) do_restart   ;; 5) do_status    ;; 6) do_logs    ;;
    7) do_rebuild   ;; 8) do_sysupdate ;; 9) do_uninstall ;;
    10) do_docker_update ;;
    0) exit 0       ;; *) show_menu    ;;
  esac
}

do_docker_update() {
  echo ""
  info "正在执行 Docker 完整更新..."
  info "步骤1: git pull 拉取最新代码..."
  if ! git -C "$INSTALL_DIR" pull 2>/dev/null; then
    err "git pull 失败，请检查网络连接"
    echo ""; read -r -p "  回车返回菜单…" _; show_menu; return
  fi
  ok "代码已更新到最新版本"

  if command -v docker &>/dev/null; then
    info "步骤2: 重建 Docker 镜像..."
    if docker compose -f "$INSTALL_DIR/docker-compose.yml" up -d --build 2>/dev/null; then
      ok "Docker 镜像重建并重启完成"
    elif docker-compose -f "$INSTALL_DIR/docker-compose.yml" up -d --build 2>/dev/null; then
      ok "Docker 镜像重建并重启完成"
    elif command -v docker &>/dev/null; then
      info "检测到 Docker 但未找到 docker-compose.yml，尝试直接构建..."
      docker build -t oasisic-downloader "$INSTALL_DIR" 2>/dev/null && \
        ok "Docker 镜像构建完成" || \
        warn "Docker 构建失败，请手动运行: cd $INSTALL_DIR && docker compose up -d --build"
    fi
  else
    info "步骤2: 更新 npm 依赖并重建前端..."
    cd "$INSTALL_DIR" && npm install --production 2>/dev/null
    cd "$INSTALL_DIR/client" && npm install 2>/dev/null && npm run build 2>/dev/null && cd "$INSTALL_DIR"
    pm2_restart
    ok "依赖更新 + 前端构建完成，服务已重启"
  fi

  info "步骤3: 更新 yt-dlp..."
  "$YTDLP_BIN" -U 2>/dev/null && ok "yt-dlp 已更新" || warn "yt-dlp 更新跳过"

  echo ""; read -r -p "  回车返回菜单…" _; show_menu
}

do_update() {
  echo ""
  info "从 GitHub 下载最新 yt-dlp..."
  BEFORE="$("$YTDLP_BIN" --version 2>/dev/null || echo '?')"
  # 直接覆盖写入，不依赖 yt-dlp -U（需要 root 权限才能写 /usr/local/bin）
  if curl -fsSL "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp"        -o "$YTDLP_BIN" 2>/dev/null; then
    chmod +x "$YTDLP_BIN"
    AFTER="$("$YTDLP_BIN" --version 2>/dev/null || echo '?')"
    [ "$BEFORE" = "$AFTER" ] && ok "已是最新版 (${AFTER})" || ok "更新: ${BEFORE} → ${AFTER}"
  else
    warn "下载失败，尝试 sudo yt-dlp -U..."
    sudo "$YTDLP_BIN" -U 2>/dev/null && ok "更新完成" || err "更新失败，请手动运行: sudo yt-dlp -U"
  fi
  echo ""; read -r -p "  回车返回菜单…" _; show_menu
}

# kill_port — 强制释放指定 TCP 端口，三重保险：
#   1. /proc/net/tcp 直读内核 TCP 表（无需任何外部工具，最可靠）
#   2. ss -tlnp 作为补充
#   3. pkill 直接按进程名+参数匹配
kill_port() {
  local PORT="$1"
  local PIDS=""

  # 方法1: /proc/net/tcp + /proc/net/tcp6（始终可用）
  local HEX_PORT
  HEX_PORT=$(printf '%04X' "$PORT")
  local INODES
  INODES=$(awk -v p=":$HEX_PORT" '
    $2 ~ p || $3 ~ p { print $10 }
  ' /proc/net/tcp /proc/net/tcp6 2>/dev/null | sort -u)
  for inode in $INODES; do
    local found
    found=$(grep -rl "socket:\[$inode\]" /proc/*/fd 2>/dev/null | head -1 | grep -oP '/proc/\K[0-9]+')
    [ -n "$found" ] && PIDS="$PIDS $found"
  done

  # 方法2: ss -tnlp 补充（语法兼容各发行版）
  local SS_PIDS
  SS_PIDS=$(ss -tnlp 2>/dev/null | awk -v port=":$PORT" '$4 ~ port {print $NF}' | \
            grep -oP 'pid=\K[0-9]+' | tr '\n' ' ')
  PIDS="$PIDS $SS_PIDS"

  # 方法3: lsof（可选，如果安装了的话）
  if command -v lsof &>/dev/null; then
    local LSOF_PIDS
    LSOF_PIDS=$(lsof -ti "tcp:${PORT}" 2>/dev/null | tr '\n' ' ')
    PIDS="$PIDS $LSOF_PIDS"
  fi

  # 去重
  PIDS=$(echo "$PIDS" | tr ' ' '\n' | grep -E '^[0-9]+$' | sort -u | tr '\n' ' ')
  [ -z "$(echo $PIDS | tr -d ' ')" ] && return 0

  # 先 TERM，再 KILL
  for PID in $PIDS; do
    kill -15 "$PID" 2>/dev/null || true
  done
  sleep 1
  for PID in $PIDS; do
    kill -0 "$PID" 2>/dev/null && { kill -9 "$PID" 2>/dev/null || true; }
  done
  sleep 1

  # 确认端口已释放
  local STILL
  STILL=$(ss -tnlp 2>/dev/null | awk -v port=":$PORT" '$4 ~ port {print "yes"}')
  [ -n "$STILL" ] && {
    # 最后手段：按进程名强杀
    pkill -9 -f "server/index.js" 2>/dev/null || true
    sleep 1
  }
  return 0
}

do_port() {
  local CUR; CUR="$(get_port)"
  echo ""
  echo -e "  当前端口: ${C}${CUR}${N}"
  read -r -p "  新端口 [1-65535]: " NP
  [[ "$NP" =~ ^[0-9]+$ ]] && [ "$NP" -ge 1 ] && [ "$NP" -le 65535 ] || {
    err "端口无效: ${NP}"; echo ""; read -r -p "  回车返回菜单…" _; show_menu; return; }

  info "停止 PM2 进程..."
  pm2 stop   "$PM2_PROC" --silent 2>/dev/null || true
  pm2 delete "$PM2_PROC" --silent 2>/dev/null || true
  pm2 save   --force     >/dev/null 2>&1 || true

  info "强制释放旧端口 ${CUR}..."
  kill_port "$CUR"

  info "写入新端口 ${NP} 到 .env..."
  grep -qE '^PORT=' "$ENV_FILE" \
    && sed -i "s/^PORT=.*/PORT=${NP}/" "$ENV_FILE" \
    || echo "PORT=${NP}" >> "$ENV_FILE"

  info "以新端口 ${NP} 启动服务..."
  pm2 start "$INSTALL_DIR/ecosystem.config.js" >/dev/null 2>&1
  pm2 save >/dev/null 2>&1

  # 验证新端口已在监听
  sleep 2
  if ss -tlnp 2>/dev/null | grep -q ":${NP}"; then
    ok "端口已修改: ${C}${CUR}${N} → ${C}${NP}${N} ✓ 已在监听"
  else
    warn "端口修改完成，但 :${NP} 尚未检测到监听（服务可能还在启动中）"
  fi
  echo ""; read -r -p "  回车返回菜单…" _; show_menu
}

do_spotify() {
  echo ""
  echo -e "  ${B}🎵 Spotify API 配置${N}"
  echo -e "  获取方式: ${C}https://developer.spotify.com/dashboard${N} → Create App（免费）"
  local CID; CID="$(grep -E '^SPOTIFY_CLIENT_ID=' "$ENV_FILE" 2>/dev/null | cut -d= -f2 | tr -d ' ' || true)"
  [ -n "$CID" ] && echo -e "  当前 ID: ${C}${CID}${N}" || echo -e "  当前 ID: ${Y}未配置${N}"
  echo ""
  read -r -p "  Client ID     (回车不修改): " SID
  read -r -p "  Client Secret (回车不修改): " SSEC
  local CHG=0
  [ -n "$SID" ]  && { grep -qE '^SPOTIFY_CLIENT_ID='     "$ENV_FILE" \
    && sed -i "s/^SPOTIFY_CLIENT_ID=.*/SPOTIFY_CLIENT_ID=${SID}/"      "$ENV_FILE" \
    || echo "SPOTIFY_CLIENT_ID=${SID}"      >> "$ENV_FILE"; CHG=1; }
  [ -n "$SSEC" ] && { grep -qE '^SPOTIFY_CLIENT_SECRET=' "$ENV_FILE" \
    && sed -i "s/^SPOTIFY_CLIENT_SECRET=.*/SPOTIFY_CLIENT_SECRET=${SSEC}/" "$ENV_FILE" \
    || echo "SPOTIFY_CLIENT_SECRET=${SSEC}" >> "$ENV_FILE"; CHG=1; }
  [ "$CHG" -eq 1 ] && { pm2_restart; ok "凭证已更新，服务已重启"; } || info "未做修改"
  echo ""; read -r -p "  回车返回菜单…" _; show_menu
}

do_restart() {
  echo ""
  info "重启服务..."
  pm2_restart
  ok "服务已重启"
  echo ""; read -r -p "  回车返回菜单…" _; show_menu
}

do_status() {
  local PORT; PORT="$(get_port)"
  local IP;   IP="$(hostname -I 2>/dev/null | awk '{print $1}' || echo localhost)"
  echo ""
  echo -e "  ${B}── PM2 进程 ──────────────────────────────────${N}"
  pm2 list 2>/dev/null | head -12
  echo ""
  echo -e "  ${B}── 信息 ──────────────────────────────────────${N}"
  echo -e "  🌐 访问地址 : ${C}http://${IP}:${PORT}${N}"
  echo -e "  ⚙  进程名称 : ${C}${PM2_PROC}${N}"
  echo -e "  🎵 yt-dlp   : $("$YTDLP_BIN" --version 2>/dev/null || echo '未安装')"
  echo -e "  📁 安装目录 : ${INSTALL_DIR}"
  echo -e "  🔧 配置文件 : ${ENV_FILE}"
  echo ""
  read -r -p "  回车返回菜单…" _; show_menu
}

do_logs() {
  echo ""
  echo -e "  ${Y}Ctrl+C 退出日志${N}"
  echo ""
  echo -e "  ${B}── 最近 30 行 ────────────────────────────────${N}"
  pm2 logs "$PM2_PROC" --lines 30 --nostream 2>/dev/null || true
  echo ""
  echo -e "  ${B}── 实时日志（Ctrl+C 退出）───────────────────${N}"
  pm2 logs "$PM2_PROC" 2>/dev/null || true
  show_menu
}

do_rebuild() {
  echo ""
  info "安装前端依赖..."
  ( cd "$INSTALL_DIR/client" && npm install --quiet ) && ok "依赖完成" \
    || { err "依赖失败"; echo ""; read -r -p "  回车…" _; show_menu; return; }
  info "Vite 构建..."
  ( cd "$INSTALL_DIR/client" && npm run build >/dev/null 2>&1 ) && ok "构建完成" \
    || { err "构建失败"; echo ""; read -r -p "  回车…" _; show_menu; return; }
  pm2_restart
  ok "前端已重建并重启"
  echo ""; read -r -p "  回车返回菜单…" _; show_menu
}

do_sysupdate() {
  echo ""
  echo -e "  ${B}📦 系统依赖检查与更新${N}"
  echo -e "  ${C}──────────────────────────────────────────${N}"
  echo ""

  # Update yt-dlp via curl (most reliable, no root issues)
  info "yt-dlp: 检查更新..."
  YTDLP_BEFORE="$("$YTDLP_BIN" --version 2>/dev/null || echo '未安装')"
  if curl -fsSL "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp"        -o "$YTDLP_BIN" 2>/dev/null && chmod +x "$YTDLP_BIN"; then
    YTDLP_AFTER="$("$YTDLP_BIN" --version 2>/dev/null || echo '?')"
    [ "$YTDLP_BEFORE" = "$YTDLP_AFTER" ]       && ok "yt-dlp ${YTDLP_AFTER} 已是最新"       || ok "yt-dlp 已更新: ${YTDLP_BEFORE} → ${YTDLP_AFTER}"
  else
    warn "yt-dlp 更新失败"
  fi

  # Check ffmpeg version
  echo ""
  info "ffmpeg: 检查..."
  if command -v ffmpeg &>/dev/null; then
    FFVER="$(ffmpeg -version 2>/dev/null | head -1 | grep -oP 'ffmpeg version \K[^ ]+')"
    ok "ffmpeg ${FFVER} 已安装"
    echo -e "  ${C}  → 如需更新 ffmpeg，运行: sudo apt update && sudo apt install -y ffmpeg${N}"
  else
    warn "ffmpeg 未安装！下载功能将无法使用"
    read -r -p "  是否立即安装 ffmpeg？[Y/n]: " _YN
    [[ "${_YN,,}" != "n" ]] && { sudo apt-get update -q && sudo apt-get install -y ffmpeg && ok "ffmpeg 已安装"; }
  fi

  # Check aria2
  echo ""
  info "aria2c: 检查..."
  if command -v aria2c &>/dev/null; then
    AR2VER="$(aria2c --version 2>/dev/null | head -1 | grep -oP 'aria2 version \K[^ ]+')"
    ok "aria2c ${AR2VER} 已安装"
    echo -e "  ${C}  → 如需更新: sudo apt update && sudo apt install -y aria2${N}"
  else
    warn "aria2c 未安装！下载速度会降低"
    read -r -p "  是否立即安装 aria2？[Y/n]: " _YN
    [[ "${_YN,,}" != "n" ]] && { sudo apt-get install -y aria2 && ok "aria2c 已安装"; }
  fi

  # Node.js version info
  echo ""
  info "Node.js: 版本检查..."
  if command -v node &>/dev/null; then
    NODEVER="$(node --version)"
    ok "Node.js ${NODEVER} 已安装"
    echo -e "  ${C}  → 如需升级: 访问 https://deb.nodesource.com 获取最新 LTS${N}"
  fi

  # PM2 update (use sudo if not root)
  echo ""
  info "PM2: 检查更新..."
  PM2_OLD="$(pm2 --version 2>/dev/null || echo '?')"
  if [ "$(id -u)" -eq 0 ]; then
    npm install -g pm2 --silent >/dev/null 2>&1 && PM2_UPDATED=1 || PM2_UPDATED=0
  else
    sudo npm install -g pm2 --silent >/dev/null 2>&1 && PM2_UPDATED=1 || PM2_UPDATED=0
  fi
  if [ "$PM2_UPDATED" -eq 1 ]; then
    PM2_NEW="$(pm2 --version 2>/dev/null || echo '?')"
    [ "$PM2_OLD" = "$PM2_NEW" ] && ok "PM2 ${PM2_NEW} 已是最新" || ok "PM2 已更新: ${PM2_OLD} → ${PM2_NEW}"
  else
    warn "PM2 更新失败，当前版本: ${PM2_OLD}"
  fi

  echo ""
  echo -e "  ${C}──────────────────────────────────────────${N}"
  ok "系统依赖检查完成"
  echo ""; read -r -p "  回车返回菜单…" _; show_menu
}

do_uninstall() {
  echo ""
  echo -e "  ${R}${B}⚠  警告：此操作不可撤销！${N}"
  echo ""
  echo -e "  将永久删除:"
  echo -e "   · 项目目录   : ${INSTALL_DIR}"
  echo -e "   · PM2 进程   : ${PM2_PROC}"
  echo -e "   · 管理命令   : /usr/local/bin/oasisic"
  echo -e "   · yt-dlp cron"
  echo ""
  read -r -p "  输入 yes/Yes/YES 确认: " CONF
  [[ "${CONF,,}" != "yes" ]] && { info "已取消"; echo ""; read -r -p "  回车…" _; show_menu; return; }
  echo ""
  printf "  %-30s" "⏹  停止 PM2 进程..."
  pm2 stop "$PM2_PROC" --silent 2>/dev/null || true
  pm2 delete "$PM2_PROC" --silent 2>/dev/null || true
  pm2 save --force >/dev/null 2>&1 || true
  echo -e "${G}完成${N}"

  printf "  %-30s" "🗑  删除项目目录..."
  if [ "$(id -u)" -eq 0 ]; then rm -rf "$INSTALL_DIR"
  else sudo rm -rf "$INSTALL_DIR" 2>/dev/null || rm -rf "$INSTALL_DIR"; fi
  echo -e "${G}完成${N}"

  printf "  %-30s" "📅 清理 cron..."
  ( crontab -l 2>/dev/null | grep -v "$YTDLP_BIN" ) | crontab - 2>/dev/null || true
  echo -e "${G}完成${N}"

  printf "  %-30s" "🗑  删除 oasisic 命令..."
  # 删除命令需要 root 权限
  if [ "$(id -u)" -eq 0 ]; then
    rm -f /usr/local/bin/oasisic 2>/dev/null && echo -e "${G}完成${N}" || echo -e "${Y}已删除（或不存在）${N}"
  else
    sudo rm -f /usr/local/bin/oasisic 2>/dev/null && echo -e "${G}完成${N}" \
      || echo -e "${Y}需要手动: sudo rm -f /usr/local/bin/oasisic${N}"
  fi

  echo ""
  echo -e "  ${G}${B}✓  Oasisic Downloader 已完全卸载${N}"
  echo ""
  exit 0
}

show_menu
__TPL__

# sed 替换占位符（路径中的 / 需转义为 \/ 以适配 sed 定界符）
sed -i \
  -e "s|@@INSTALL_DIR@@|${SCRIPT_DIR}|g" \
  -e "s|@@YTDLP_BIN@@|${YTDLP_BIN}|g"   \
  -e "s|@@ENV_FILE@@|${ENV_FILE}|g"       \
  -e "s|@@PM2_PROC@@|${PM2_PROC}|g"      \
  "$OASISIC_TMP"

# 安装 oasisic 命令（需要写入 /usr/local/bin，可能需要 root 权限）
# 先删除旧文件（避免 install/cp 因权限位冲突失败），再写入
if [ -f "$OASISIC_CMD" ]; then
  if [ "$(id -u)" -eq 0 ]; then
    rm -f "$OASISIC_CMD"
  else
    sudo rm -f "$OASISIC_CMD" 2>/dev/null || rm -f "$OASISIC_CMD" 2>/dev/null || true
  fi
fi
if [ "$(id -u)" -eq 0 ]; then
  cp "$OASISIC_TMP" "$OASISIC_CMD" && chmod 755 "$OASISIC_CMD"
else
  sudo cp "$OASISIC_TMP" "$OASISIC_CMD" && sudo chmod 755 "$OASISIC_CMD"     || { cp "$OASISIC_TMP" "$OASISIC_CMD" && chmod 755 "$OASISIC_CMD"; }
fi
rm -f "$OASISIC_TMP"

# 验证语法
bash -n "$OASISIC_CMD" 2>/dev/null \
  && ok "管理命令已注册: ${C}oasisic${N}" \
  || fail "oasisic 脚本语法验证失败，请检查日志"

# =============================================================================
step "✅ 安装完成"
# =============================================================================
LOCAL_IP="$(hostname -I 2>/dev/null | awk '{print $1}' || echo localhost)"
COOKIE_PATH="$SCRIPT_DIR/server/cookies.txt"

echo ""
echo -e "${G}${B}  ✓  Oasisic Downloader 安装成功${N}"
echo -e "  ${G}──────────────────────────────────────────${N}"
echo ""
echo -e "  🌐 访问地址   ${C}http://${LOCAL_IP}:${CHOSEN_PORT}${N}"
echo -e "  🛠  管理命令   ${C}oasisic${N}"
echo -e "  📋 实时日志   ${C}pm2 logs ${PM2_PROC}${N}"
echo -e "  📁 下载目录   ${SCRIPT_DIR}/downloads/"
echo -e "  🔧 配置文件   ${C}${ENV_FILE}${N}"
echo ""
echo -e "  ${B}── 🤖 YouTube Bot 检测解决方案 ──────────────────${N}"
echo -e "  如遇 ${Y}\"Sign in to confirm you're not a bot\"${N} 错误："
echo ""
echo -e "  方法一（推荐）— yt-dlp 直接从浏览器导出 Cookie："
echo -e "  ${C}  yt-dlp --cookies-from-browser chrome -o /dev/null https://www.youtube.com${N}"
echo -e "  ${C}  cp cookies.txt ${COOKIE_PATH}${N}"
echo ""
echo -e "  方法二 — Chrome 扩展手动导出："
echo -e "  ${C}  安装 \"Get cookies.txt LOCALLY\" 扩展 → 登录 YouTube → 导出 → 上传到服务器${N}"
echo ""
if [ -f "$COOKIE_PATH" ]; then
  ok "已检测到 cookies.txt，将自动用于所有下载请求 🍪"
else
  warn "未检测到 cookies.txt（遇到 bot 检测时按上述步骤配置）"
fi
echo ""
