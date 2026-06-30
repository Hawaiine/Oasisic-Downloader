#!/usr/bin/env bash
# ============================================================
# oasisic — Oasisic Downloader 管理命令
# install.sh 会自动复制此文件到 /usr/local/bin/oasisic
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
ENV_FILE="$SCRIPT_DIR/server/.env"
YTDLP_BIN="/usr/local/bin/yt-dlp"
PM2_PROC="oasisic-downloader"

get_port() { grep -E '^PORT=' "$ENV_FILE" 2>/dev/null | head -1 | cut -d= -f2 | tr -d ' ' || echo 3000; }
pm2_restart() {
  pm2 stop "$PM2_PROC" --silent 2>/dev/null || true
  pm2 delete "$PM2_PROC" --silent 2>/dev/null || true
  pm2 start "$SCRIPT_DIR/ecosystem.config.js" >/dev/null 2>&1
  pm2 save >/dev/null 2>&1
}

show_menu() {
  clear 2>/dev/null || printf '\033[2J\033[H'
  PORT="$(get_port)"
  echo ""
  echo "  ╔══════════════════════════════════════╗"
  echo "  ║   🧲 Oasisic Downloader              ║"
  echo "  ║   ${PORT:+端口: ${PORT}}                        ║"
  echo "  ╚══════════════════════════════════════╝"
  echo ""
  echo "  1)  🔄  更新 yt-dlp"
  echo "  2)  🔌  修改端口"
  echo "  3)  🎵  Spotify 凭证"
  echo "  4)  ↺   重启服务"
  echo "  5)  📊  状态信息"
  echo "  6)  📋  查看日志"
  echo "  7)  🔨  重新构建前端"
  echo "  8)  🗑   卸载"
  echo ""
  echo "  0)  退出"
  echo ""
  read -r -p "  请选择 [0-8]: " c
  case "$c" in
    1) do_update ;; 2) do_port ;; 3) do_spotify ;;
    4) pm2_restart; echo "已重启"; press_any_key ;;
    5) do_status ;; 6) do_logs ;;
    7) do_rebuild ;; 8) do_uninstall ;;
    0) exit 0 ;; *) show_menu ;;
  esac
}

press_any_key() { read -r -p "  按回车返回菜单..." _; show_menu; }

do_update() {
  echo ""
  echo "  更新 yt-dlp..."
  curl -fsSL "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp" -o "$YTDLP_BIN" 2>/dev/null \
    && chmod +x "$YTDLP_BIN" && echo "  ✅ yt-dlp $("$YTDLP_BIN" --version)" \
    || { sudo "$YTDLP_BIN" -U 2>/dev/null || echo "  ❌ 更新失败"; }
  press_any_key
}

do_port() {
  CUR="$(get_port)"
  read -r -p "  当前 ${CUR} → 新端口: " NP
  [[ "$NP" =~ ^[0-9]+$ ]] && [ "$NP" -ge 1 ] && [ "$NP" -le 65535 ] || { echo "无效端口"; press_any_key; return; }
  pm2 stop "$PM2_PROC" --silent 2>/dev/null || true
  pm2 delete "$PM2_PROC" --silent 2>/dev/null || true
  grep -qE '^PORT=' "$ENV_FILE" && sed -i "s/^PORT=.*/PORT=${NP}/" "$ENV_FILE" || echo "PORT=${NP}" >> "$ENV_FILE"
  pm2 start "$SCRIPT_DIR/ecosystem.config.js" >/dev/null 2>&1
  pm2 save >/dev/null 2>&1
  echo "  ✅ 端口: ${CUR} → ${NP}"
  press_any_key
}

do_spotify() {
  CID="$(grep -E '^SPOTIFY_CLIENT_ID=' "$ENV_FILE" 2>/dev/null | cut -d= -f2 | tr -d ' ' || true)"
  echo "  当前 ID: ${CID:-未配置}"
  read -r -p "  Client ID     (回车不改): " SID
  read -r -p "  Client Secret (回车不改): " SSEC
  [ -n "$SID" ]  && { grep -qE '^SPOTIFY_CLIENT_ID=' "$ENV_FILE" && sed -i "s/^SPOTIFY_CLIENT_ID=.*/SPOTIFY_CLIENT_ID=${SID}/" "$ENV_FILE" || echo "SPOTIFY_CLIENT_ID=${SID}" >> "$ENV_FILE"; }
  [ -n "$SSEC" ] && { grep -qE '^SPOTIFY_CLIENT_SECRET=' "$ENV_FILE" && sed -i "s/^SPOTIFY_CLIENT_SECRET=.*/SPOTIFY_CLIENT_SECRET=${SSEC}/" "$ENV_FILE" || echo "SPOTIFY_CLIENT_SECRET=${SSEC}" >> "$ENV_FILE"; }
  echo "  ✅ 已更新"
  press_any_key
}

do_status() {
  IP="$(hostname -I 2>/dev/null | awk '{print $1}' || echo localhost)"
  PORT="$(get_port)"
  echo ""
  echo "  🌐  http://${IP}:${PORT}"
  echo "  🎵  yt-dlp $("$YTDLP_BIN" --version 2>/dev/null || echo '?')"
  echo ""
  pm2 list 2>/dev/null
  press_any_key
}

do_logs() {
  echo "  Ctrl+C 退出日志"
  pm2 logs "$PM2_PROC" --lines 30 --nostream 2>/dev/null || true
  pm2 logs "$PM2_PROC" 2>/dev/null || true
  show_menu
}

do_rebuild() {
  (cd "$SCRIPT_DIR/client" && npm install --quiet 2>/dev/null && npm run build >/dev/null 2>&1) \
    && { pm2_restart; echo "  ✅ 重建完成"; } || echo "  ❌ 失败"
  press_any_key
}

do_uninstall() {
  echo ""
  echo "  ⚠️  确认卸载 Oasisic Downloader？[y/N]"
  read -r -p "  → " yn
  [[ "${yn,,}" != "y" ]] && { echo "已取消"; press_any_key; return; }
  pm2 stop "$PM2_PROC" --silent 2>/dev/null || true
  pm2 delete "$PM2_PROC" --silent 2>/dev/null || true
  pm2 save --force >/dev/null 2>&1
  rm -f "/usr/local/bin/oasisic" 2>/dev/null
  echo "  ✅ 已卸载 (项目文件保留在 ${SCRIPT_DIR})"
}

show_menu