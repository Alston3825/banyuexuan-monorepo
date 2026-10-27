#!/usr/bin/env bash
# 生成 docs/进度快照.md：最新提交、最近改动、数据库迁移、模块清单、待完善清单摘要。
# 由 GitHub Action（.github/workflows/daily-snapshot.yml）每天自动运行，也可手动运行：bash scripts/generate-handoff-snapshot.sh
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="docs/进度快照.md"
NOW="$(TZ=Asia/Shanghai date '+%Y-%m-%d %H:%M')"
HEAD_SHA="$(git rev-parse --short HEAD)"

{
  echo "# 进度快照（自动生成，请勿手改）"
  echo
  echo "- 生成时间：$NOW（北京时间）　代码版本：\`$HEAD_SHA\`"
  echo "- 接手请先读 [交接手册](./交接手册.md) 和 [开发约定](../AGENTS.md)；本文件只反映“现在仓库里有什么、最近改了什么”。"
  echo
  echo "## 最近 40 次改动"
  git log -40 --date=format:'%Y-%m-%d' --pretty='- %ad `%h` %s' -- . ':!docs/进度快照.md' | sed 's/Co-Authored-By.*//'
  echo
  echo "## 数据库迁移（共 $(ls apps/api/prisma/migrations | grep -c '^[0-9]') 个，最近 8 个）"
  ls apps/api/prisma/migrations | grep '^[0-9]' | tail -8 | sed 's/^/- /'
  echo
  echo "## 后端模块（apps/api/src）"
  ls -d apps/api/src/*/ | xargs -n1 basename | tr '\n' ' ' | sed 's/ $//; s/^/- /'
  echo
  echo
  echo "## 页面目录（apps/web/src/views）"
  ls -d apps/web/src/views/*/ | xargs -n1 basename | tr '\n' ' ' | sed 's/ $//; s/^/- /'
  echo
  echo
  echo "## 测试"
  echo "- 后端端到端测试文件 $(ls apps/api/test/*.e2e-spec.ts | wc -l | tr -d ' ') 个（\`apps/api/test/\`）"
  echo
  echo "## 待完善清单（docs/待完善清单.md 最后 25 行）"
  tail -25 docs/待完善清单.md | cut -c1-240
} > "$OUT"
echo "已生成 $OUT"
