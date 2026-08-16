#!/usr/bin/env bash
# 伴月轩月子中心管理系统 —— 一键部署脚本
#
# 用途：在一台"刚重置为纯净系统"的腾讯云服务器（轻量应用服务器/CVM，Ubuntu/Debian）上，
# 一条命令完成：
#   1. 安装 Docker
#   2. 生成生产环境密钥/密码（.env.prod），交互式询问几项业务信息（租户名/门店名/管理员账号）
#   3. 启动应用三个服务 + 自建 MySQL/Redis 容器（免费，不购买腾讯云托管数据库）
#   4. 等数据库就绪 → 自动执行数据库结构迁移 → 生成你的管理员账号
#   5.（可选）如果你已经有域名并解析到这台服务器，自动申请免费HTTPS证书
#   6. 注册每天凌晨的数据库自动备份定时任务（自建数据库没有腾讯云托管的自动备份，这一步补上）
#
# 用法：
#   1) 先把代码放到服务器上（在服务器上执行，把仓库地址换成你自己的）：
#        git clone <你的仓库地址> banyuexuan && cd banyuexuan
#   2) 再执行本脚本（必须用 root 权限，因为要装Docker/装Nginx/注册系统级定时任务）：
#        sudo bash scripts/deploy.sh
#
# 脚本是幂等的：重复执行不会覆盖已经生成好的 .env.prod、不会重复生成密钥/重复建管理员账号
# （管理员账号那一步走的是 upsert，见 docs/生产数据库迁移与种子数据策略.md）。
# 想要拉了新代码后重新发布，直接再跑一次这个脚本就行。

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

ENV_FILE="$REPO_ROOT/.env.prod"
COMPOSE_BASE="-f docker-compose.prod.yml"
HTTPS_MARKER="$REPO_ROOT/.deploy-https-domain"

# ---------- 输出辅助函数 ----------
c_green() { printf '\033[32m%s\033[0m\n' "$1"; }
c_yellow() { printf '\033[33m%s\033[0m\n' "$1"; }
c_red() { printf '\033[31m%s\033[0m\n' "$1"; }
step() { echo; c_green "==> $1"; }
warn() { c_yellow "!! $1"; }
# 下面 sed 替换用 | 做分隔符；如果用户手工输入的门店名/密码里恰好包含 \ 、 & 或 | ，
# 不转义会破坏sed语法或被解释成"整段匹配文本"，这里统一转义成字面量再拼进sed命令。
sed_escape() { printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/&/\\\&/g' -e 's/|/\\|/g'; }

trap 'c_red "部署中断：第 $LINENO 行执行失败，请把上面的错误信息截图/复制给开发助手。"' ERR

# ---------- 0. 前置检查 ----------
if [[ $EUID -ne 0 ]]; then
  c_red "请用 root 权限运行本脚本：sudo bash scripts/deploy.sh"
  exit 1
fi

if [[ ! -f "$REPO_ROOT/docker-compose.prod.yml" ]]; then
  c_red "没有在当前目录找到 docker-compose.prod.yml，请确认你是在仓库根目录执行本脚本。"
  exit 1
fi

# ---------- 1. 安装 Docker ----------
step "检查 Docker"
if ! command -v docker >/dev/null 2>&1; then
  echo "未检测到 Docker，开始安装（国内服务器可能需要几分钟）..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
else
  echo "Docker 已安装：$(docker --version)"
fi

if ! docker compose version >/dev/null 2>&1; then
  c_red "Docker 已安装，但 'docker compose' 插件不可用。这台服务器的 Docker 版本可能过旧，"
  c_red "请手动执行一次: curl -fsSL https://get.docker.com | sh   然后重新运行本脚本。"
  exit 1
fi

# ---------- 2. 生成 .env.prod ----------
step "检查生产环境变量文件 .env.prod"
if [[ -f "$ENV_FILE" ]]; then
  echo "检测到已存在的 $ENV_FILE，跳过生成，直接使用现有配置部署。"
  echo "（如果你想重新生成一份全新的密钥/密码，先把这个文件改名或删除，再重新运行本脚本。）"
else
  echo "未检测到 $ENV_FILE，开始生成。以下几项需要你手工确认，直接回车使用默认值即可。"
  echo

  read -r -p "租户代码（英文缩写，如公司拼音，默认 banyuexuan）: " IN_TENANT_CODE
  TENANT_CODE="${IN_TENANT_CODE:-banyuexuan}"

  read -r -p "月子中心名称（默认 伴月轩月子中心）: " IN_TENANT_NAME
  TENANT_NAME="${IN_TENANT_NAME:-伴月轩月子中心}"

  read -r -p "第一家门店代码（默认 ST001）: " IN_STORE_CODE
  STORE_CODE="${IN_STORE_CODE:-ST001}"

  read -r -p "第一家门店名称（默认 伴月轩·旗舰店）: " IN_STORE_NAME
  STORE_NAME="${IN_STORE_NAME:-伴月轩·旗舰店}"

  read -r -p "管理员登录用户名（默认 admin）: " IN_ADMIN_USER
  ADMIN_USER="${IN_ADMIN_USER:-admin}"

  read -r -s -p "管理员密码（直接回车=自动生成一个强密码，部署完成后会打印出来）: " IN_ADMIN_PASS
  echo
  if [[ -n "$IN_ADMIN_PASS" ]]; then
    ADMIN_PASS="$IN_ADMIN_PASS"
    if [[ ${#ADMIN_PASS} -lt 12 ]]; then
      c_red "密码长度不足12位，种子脚本会拒绝执行。请重新运行脚本并使用更长的密码，或直接回车让脚本自动生成。"
      exit 1
    fi
  else
    ADMIN_PASS="$(openssl rand -base64 18 | tr -d '/+=\n')"
  fi

  echo
  read -r -p "域名（已经解析到本机公网IP，用于申请免费HTTPS证书；暂时没有就直接回车跳过，先用IP访问）: " DOMAIN
  if [[ -n "$DOMAIN" ]]; then
    read -r -p "用于接收证书到期提醒的邮箱（可回车跳过，不影响自动续期）: " CERT_EMAIL
  fi

  echo
  echo "正在生成随机密钥/密码..."
  MYSQL_ROOT_PASSWORD="$(openssl rand -hex 24)"
  MYSQL_PASSWORD="$(openssl rand -hex 24)"
  REDIS_PASSWORD="$(openssl rand -hex 24)"
  JWT_ACCESS_SECRET="$(openssl rand -base64 48 | tr -d '\n')"
  JWT_REFRESH_SECRET="$(openssl rand -base64 48 | tr -d '\n')"
  AI_GATEWAY_KEY="$(openssl rand -hex 32)"
  MYSQL_DATABASE="banyuexuan_prod"
  MYSQL_USER="banyuexuan"

  cp .env.prod.example "$ENV_FILE"

  # 用 | 做sed分隔符。随机生成的密钥/密码本身不会包含特殊字符，不用转义；但门店名/管理员
  # 用户名密码是用户手工输入的自由文本，万一里面恰好带 \ & | 会破坏sed语法，统一转义一遍。
  E_TENANT_CODE="$(sed_escape "$TENANT_CODE")"
  E_TENANT_NAME="$(sed_escape "$TENANT_NAME")"
  E_STORE_CODE="$(sed_escape "$STORE_CODE")"
  E_STORE_NAME="$(sed_escape "$STORE_NAME")"
  E_ADMIN_USER="$(sed_escape "$ADMIN_USER")"
  E_ADMIN_PASS="$(sed_escape "$ADMIN_PASS")"

  sed -i \
    -e "s|^MYSQL_ROOT_PASSWORD=.*|MYSQL_ROOT_PASSWORD=${MYSQL_ROOT_PASSWORD}|" \
    -e "s|^MYSQL_DATABASE=.*|MYSQL_DATABASE=${MYSQL_DATABASE}|" \
    -e "s|^MYSQL_USER=.*|MYSQL_USER=${MYSQL_USER}|" \
    -e "s|^MYSQL_PASSWORD=.*|MYSQL_PASSWORD=${MYSQL_PASSWORD}|" \
    -e "s|^REDIS_PASSWORD=.*|REDIS_PASSWORD=${REDIS_PASSWORD}|" \
    -e "s|^DATABASE_URL=.*|DATABASE_URL=mysql://${MYSQL_USER}:${MYSQL_PASSWORD}@mysql:3306/${MYSQL_DATABASE}|" \
    -e "s|^REDIS_URL=.*|REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379|" \
    -e "s|^JWT_ACCESS_SECRET=.*|JWT_ACCESS_SECRET=${JWT_ACCESS_SECRET}|" \
    -e "s|^JWT_REFRESH_SECRET=.*|JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}|" \
    -e "s|^SEED_TENANT_CODE=.*|SEED_TENANT_CODE=${E_TENANT_CODE}|" \
    -e "s|^SEED_TENANT_NAME=.*|SEED_TENANT_NAME=${E_TENANT_NAME}|" \
    -e "s|^SEED_STORE_CODE=.*|SEED_STORE_CODE=${E_STORE_CODE}|" \
    -e "s|^SEED_STORE_NAME=.*|SEED_STORE_NAME=${E_STORE_NAME}|" \
    -e "s|^SEED_ADMIN_USERNAME=.*|SEED_ADMIN_USERNAME=${E_ADMIN_USER}|" \
    -e "s|^SEED_ADMIN_PASSWORD=.*|SEED_ADMIN_PASSWORD=${E_ADMIN_PASS}|" \
    -e "s|^AI_GATEWAY_INTERNAL_API_KEY=.*|AI_GATEWAY_INTERNAL_API_KEY=${AI_GATEWAY_KEY}|" \
    -e "s|^INTERNAL_API_KEY=.*|INTERNAL_API_KEY=${AI_GATEWAY_KEY}|" \
    "$ENV_FILE"

  chmod 600 "$ENV_FILE"
  echo "已生成 $ENV_FILE（权限600，只有root能读）。"
  echo
  warn "火山引擎/MiniMax 的 AI Key 这次没有问：想启用AI客服/护理异常AI建议功能，"
  warn "编辑 .env.prod 把 VOLCENGINE_API_KEY 等几项填上，再重新运行本脚本即可生效，不影响其它功能。"
fi

# ---------- 3. 启动服务 ----------
COMPOSE_CMD="docker compose $COMPOSE_BASE --env-file .env.prod"
if [[ -f "$HTTPS_MARKER" ]]; then
  COMPOSE_CMD="$COMPOSE_CMD -f docker-compose.https.override.yml"
fi

step "构建并启动容器（首次构建镜像可能需要几分钟，请耐心等待）"
$COMPOSE_CMD up -d --build

step "等待 MySQL/Redis/API 就绪"
ATTEMPTS=0
until $COMPOSE_CMD exec -T api wget -qO- http://localhost:3000/api/v1/health >/dev/null 2>&1; do
  ATTEMPTS=$((ATTEMPTS + 1))
  if [[ $ATTEMPTS -gt 60 ]]; then
    c_red "等了5分钟API还没就绪，请执行 'docker compose -f docker-compose.prod.yml logs api' 查看具体报错。"
    exit 1
  fi
  sleep 5
  echo "  仍在等待中...（$ATTEMPTS/60）"
done
echo "API 已就绪。"

# ---------- 4. 生成管理员账号（幂等，可放心重复执行） ----------
step "写入权限目录/角色/工作流定义，并生成管理员账号"
$COMPOSE_CMD exec -T api sh -c "NODE_ENV=production npx prisma db seed"

# ---------- 5. 可选：域名 + 免费HTTPS ----------
if [[ -f "$HTTPS_MARKER" ]]; then
  step "检测到已配置过HTTPS域名（$(cat "$HTTPS_MARKER")），跳过重复配置"
elif [[ -n "${DOMAIN:-}" ]]; then
  step "为域名 $DOMAIN 申请免费HTTPS证书"
  if ! command -v apt-get >/dev/null 2>&1; then
    warn "当前系统不是 Debian/Ubuntu 系，脚本没有自动装 nginx+certbot，HTTPS需要你手动配置，先用IP+HTTP访问。"
  else
    apt-get update -y
    apt-get install -y nginx certbot python3-certbot-nginx

    # 把 web 容器改成只监听本机8080，80/443交给宿主机nginx，nginx再反代过去。
    # 注意：compose对list类型字段（ports）默认是"多个-f文件的值合并/拼接"而不是"后面
    # 的覆盖前面的"，如果这里不加 !override，最终容器会同时监听0.0.0.0:80（继承自
    # docker-compose.prod.yml）和127.0.0.1:8080两个端口——80还是被容器占着，宿主机
    # nginx永远抢不到80端口，"systemctl reload nginx"会因为nginx从未真正start成功
    # （装的时候port 80被占用，postinst跳过了自动启动）而失败。!override是compose
    # spec的合并策略标签，显式声明"这个字段整体替换，不是拼接"。
    cat > "$REPO_ROOT/docker-compose.https.override.yml" <<EOF
services:
  web:
    ports: !override
      - "127.0.0.1:8080:80"
EOF
    docker compose $COMPOSE_BASE --env-file .env.prod -f docker-compose.https.override.yml up -d

    cat > "/etc/nginx/sites-available/banyuexuan.conf" <<EOF
server {
    listen 80;
    server_name ${DOMAIN};
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
    ln -sf /etc/nginx/sites-available/banyuexuan.conf /etc/nginx/sites-enabled/banyuexuan.conf
    rm -f /etc/nginx/sites-enabled/default
    # 用restart不用reload：nginx刚装好时80端口还被web容器占着，装包时nginx自己没能
    # 启动成功（"port 80 is already in use"），此时nginx.service处于inactive状态，
    # reload要求服务已经在跑，会报"not active, cannot reload"——上面已经把web容器挪到
    # 8080腾出80端口了，restart在服务未运行时会直接启动它，未运行/已运行两种情况都适用。
    nginx -t && systemctl restart nginx && systemctl enable nginx

    CERTBOT_EMAIL_ARGS="--register-unsafely-without-email"
    if [[ -n "${CERT_EMAIL:-}" ]]; then
      CERTBOT_EMAIL_ARGS="-m ${CERT_EMAIL}"
    fi
    if certbot --nginx -d "$DOMAIN" --redirect --agree-tos --non-interactive $CERTBOT_EMAIL_ARGS; then
      echo "$DOMAIN" > "$HTTPS_MARKER"
      echo "HTTPS 配置成功，证书会由 certbot 自带的定时任务自动续期，不需要你手动管理。"
    else
      warn "证书申请失败——最常见原因是域名还没解析到这台服务器的公网IP，或者腾讯云安全组没放行80端口。"
      warn "先确认这两点，再手动执行: certbot --nginx -d $DOMAIN --redirect --agree-tos"
    fi
  fi
else
  echo "本次未提供域名，跳过HTTPS配置，先用服务器公网IP访问（http://<公网IP>）。"
  echo "以后有域名了，删除 .env.prod 重新触发（会重新问一遍）比较麻烦——更简单的做法是"
  echo "手动参考 docs/部署操作手册.md「域名与HTTPS」一节单独配置，不需要重新走整个脚本。"
fi

# ---------- 6. 注册每日数据库备份定时任务 ----------
step "注册每日凌晨3点的数据库自动备份任务"
chmod +x "$SCRIPT_DIR/backup-mysql.sh"
cat > /etc/cron.d/banyuexuan-backup <<EOF
0 3 * * * root REPO_ROOT=${REPO_ROOT} bash ${SCRIPT_DIR}/backup-mysql.sh >> /var/log/banyuexuan-backup.log 2>&1
EOF
chmod 644 /etc/cron.d/banyuexuan-backup
echo "已注册：备份文件会存在 ${REPO_ROOT}/backups/ 目录下，默认保留最近14天。"

# ---------- 7. 完成 ----------
echo
c_green "========================================"
c_green " 部署完成"
c_green "========================================"
if [[ -f "$HTTPS_MARKER" ]]; then
  echo "访问地址：https://$(cat "$HTTPS_MARKER")"
else
  PUBLIC_IP="$(curl -fsSL -4 ip.sb 2>/dev/null || curl -fsSL -4 ifconfig.me 2>/dev/null || echo '<服务器公网IP>')"
  echo "访问地址：http://${PUBLIC_IP}"
fi
if [[ -n "${TENANT_CODE:-}" ]]; then
  echo
  echo "管理员账号：${ADMIN_USER}"
  echo "管理员密码：${ADMIN_PASS}"
  c_yellow "^^ 这个密码只会在这里显示一次，请立刻保存到你的密码管理工具里，并在首次登录后建议修改。"
fi
echo
echo "别忘了检查：腾讯云控制台 -> 安全组，放行 80 端口（配置了HTTPS的话还要放行443端口）。"
echo "以后发布新版本代码：git pull 之后重新运行 sudo bash scripts/deploy.sh 即可（不会重复生成密钥/重复建号）。"
