#!/usr/bin/env bash
# 在用户的 Mac 上一次性安装“每天 12:30 自动异地备份”定时任务（launchd）。重复运行是安全的。
set -euo pipefail
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/offsite-backup-pull.sh"
BIN="$HOME/.banyuexuan"; PLIST="$HOME/Library/LaunchAgents/com.banyuexuan.offsite-backup.plist"
LOG="$HOME/Library/Logs/banyuexuan-offsite-backup.log"
mkdir -p "$BIN" "$HOME/Library/LaunchAgents"
cp "$SRC" "$BIN/offsite-backup-pull.sh"; chmod +x "$BIN/offsite-backup-pull.sh"
cat > "$PLIST" <<EOP
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.banyuexuan.offsite-backup</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$BIN/offsite-backup-pull.sh</string></array>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>12</integer><key>Minute</key><integer>30</integer></dict>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict></plist>
EOP
launchctl bootout "gui/$(id -u)/com.banyuexuan.offsite-backup" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "已安装：每天 12:30 自动运行（电脑睡眠错过的话，醒来后补跑一次）。日志：$LOG"
