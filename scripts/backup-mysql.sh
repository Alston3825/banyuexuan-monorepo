#!/usr/bin/env bash
# 自建MySQL的每日备份脚本。腾讯云托管数据库自带自动备份，我们为了省钱自建在容器里跑MySQL，
# 这个功能就得自己补——scripts/deploy.sh 会自动把本脚本注册进 /etc/cron.d，每天凌晨3点执行。
#
# 也可以随时手动执行一次： bash scripts/backup-mysql.sh
set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
cd "$REPO_ROOT"

ENV_FILE="$REPO_ROOT/.env.prod"
BACKUP_DIR="$REPO_ROOT/backups"
KEEP_DAYS=14

if [[ ! -f "$ENV_FILE" ]]; then
  echo "找不到 $ENV_FILE，跳过备份。" >&2
  exit 1
fi

MYSQL_DATABASE="$(grep -E '^MYSQL_DATABASE=' "$ENV_FILE" | head -n1 | cut -d= -f2-)"
if [[ -z "$MYSQL_DATABASE" ]]; then
  echo ".env.prod 里没有 MYSQL_DATABASE，跳过备份。" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT_FILE="$BACKUP_DIR/${MYSQL_DATABASE}-${STAMP}.sql.gz"

# mysqldump在容器内部执行，密码直接读容器自己的环境变量（env_file已经注入），
# 不需要从宿主机传进去，也就不会在 `docker compose exec` 的进程列表里明文暴露密码。
docker compose -f docker-compose.prod.yml exec -T mysql \
  sh -c "mysqldump -uroot -p\"\$MYSQL_ROOT_PASSWORD\" --single-transaction --routines --triggers \"$MYSQL_DATABASE\"" \
  | gzip > "$OUT_FILE"

echo "$(date '+%F %T') 备份完成：$OUT_FILE（$(du -h "$OUT_FILE" | cut -f1)）"

# 合同原件、护理档案照片（持久卷 api_storage）一起打包。目录为空/容器没起时不影响数据库备份。
FILES_OUT="$BACKUP_DIR/files-${STAMP}.tar.gz"
if docker compose -f docker-compose.prod.yml exec -T api sh -c 'test -d /repo/apps/api/storage && tar czf - -C /repo/apps/api storage' > "$FILES_OUT" 2>/dev/null && [[ -s "$FILES_OUT" ]]; then
  echo "$(date '+%F %T') 文件备份完成：$FILES_OUT（$(du -h "$FILES_OUT" | cut -f1)）"
else
  rm -f "$FILES_OUT"
  echo "$(date '+%F %T') 暂无需要备份的上传文件（或 api 容器未运行），跳过文件备份。"
fi

# 只保留最近 KEEP_DAYS 天，避免备份文件把磁盘占满
find "$BACKUP_DIR" -name "${MYSQL_DATABASE}-*.sql.gz" -mtime "+${KEEP_DAYS}" -delete
find "$BACKUP_DIR" -name "files-*.tar.gz" -mtime "+${KEEP_DAYS}" -delete
