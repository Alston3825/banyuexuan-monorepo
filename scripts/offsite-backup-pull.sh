#!/usr/bin/env bash
# 在“用户的 Mac 上”运行：把线上服务器最新的数据库备份、上传文件备份拉到本机，加密后放进百度同步盘（异地备份）；
# 同时把线上密钥配置 .env.prod 拉到本机一个不同步网盘的文件夹。每天由 launchd 定时运行（见 install-offsite-backup-mac.sh）。
# 手动运行：bash scripts/offsite-backup-pull.sh
set -euo pipefail

KEY="${BYX_SSH_KEY:-$HOME/Desktop/百度同步盘/AI 密匙/fanqieai1004.pem}"
HOST="${BYX_SSH_HOST:-ubuntu@fanqieai.cc}"
DEST="${BYX_BACKUP_DEST:-$HOME/Desktop/百度同步盘/伴月轩AI系统开发/线上备份}"
SECRETS="${BYX_SECRETS_DIR:-$HOME/伴月轩备份-密钥}"
PASSFILE="${BYX_PASSFILE:-$HOME/.banyuexuan-backup-pass}"
KEEP_DAYS=14
SSH=(ssh -i "$KEY" -o IdentitiesOnly=yes -o BatchMode=yes -o ConnectTimeout=20 "$HOST")
log() { echo "$(date '+%F %T') $*"; }

[[ -f "$KEY" ]] || { log "找不到 SSH 私钥：$KEY"; exit 1; }
mkdir -p "$DEST"; mkdir -p "$SECRETS"; chmod 700 "$SECRETS"
if [[ ! -f "$PASSFILE" ]]; then
  umask 077; openssl rand -base64 32 > "$PASSFILE"
  log "已生成加密口令文件 $PASSFILE（请把它另存进密码管理器，丢了备份就无法还原）"
fi

latest() { "${SSH[@]}" "ls -1t ~/banyuexuan/backups/$1 2>/dev/null | head -n1"; }
pull_encrypted() { # $1 服务器上的文件名
  local name="$1" out="$DEST/$1.enc"
  [[ -s "$out" ]] && { log "已有 $name，跳过"; return; }
  "${SSH[@]}" "sudo cat ~/banyuexuan/backups/$name" | openssl enc -aes-256-cbc -pbkdf2 -salt -pass "file:$PASSFILE" -out "$out.part"
  [[ -s "$out.part" ]] || { rm -f "$out.part"; log "拉取 $name 失败（空文件）"; return 1; }
  mv "$out.part" "$out"; log "已备份并加密：$out（$(du -h "$out" | cut -f1)）"
}

DB="$(latest '*.sql.gz')"; FILES="$(latest 'files-*.tar.gz')"
[[ -n "$DB" ]] && pull_encrypted "$DB" || log "服务器上没有数据库备份"
[[ -n "$FILES" ]] && pull_encrypted "$FILES" || log "服务器上没有文件备份"

"${SSH[@]}" "sudo cat ~/banyuexuan/.env.prod" > "$SECRETS/env.prod.latest.part"
if [[ -s "$SECRETS/env.prod.latest.part" ]]; then mv "$SECRETS/env.prod.latest.part" "$SECRETS/env.prod.latest"; chmod 600 "$SECRETS/env.prod.latest"; log "已更新密钥配置备份：$SECRETS/env.prod.latest"; else rm -f "$SECRETS/env.prod.latest.part"; log "拉取 .env.prod 失败"; fi

find "$DEST" -name '*.enc' -mtime +$KEEP_DAYS -delete
log "完成。备份目录：$DEST"
