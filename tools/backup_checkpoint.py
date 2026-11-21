#!/usr/bin/env python3
"""更新交接、备份单个项目、核对远端并留不可覆盖的检查点；不部署。"""
import argparse
import datetime as dt
import fcntl
import hashlib
import json
import os
import time
from pathlib import Path
from zoneinfo import ZoneInfo

import source_snapshot_engine as engine

ROOT = Path(__file__).resolve().parents[1]
BASE = engine.BASE
TZ = ZoneInfo('America/Los_Angeles')
PROJECT = {'id': 'ai', 'name': '伴月轩月子中心AI系统', 'repo': 'Alston3825/banyuexuan-monorepo',
           'source': str(ROOT), 'existing': True}
ENTRIES = ['AGENTS.md', 'docs/交接手册.md', 'docs/当前开发任务.md', 'docs/待完善清单.md',
           'docs/系统检查报告-2026-11-20.md', '备份与交接/备份计划.md',
           '备份与交接/恢复步骤.md', '备份与交接/资料边界.md']


def atomic_json(path, value):
    tmp = path.with_suffix('.part')
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    os.replace(tmp, path)


def prepare(now):
    folder = ROOT / '备份与交接'
    folder.mkdir(exist_ok=True)
    evidence = {}
    for name in ENTRIES:
        evidence[name] = hashlib.sha256((ROOT / name).read_bytes()).hexdigest()
    task = (ROOT / 'docs/当前开发任务.md').read_text()
    previous_path = BASE / 'ai-manifest.json'
    previous = json.loads(previous_path.read_text()) if previous_path.exists() else {}
    changed = []
    # 这里只记录开发资料的变化，是否上传成功由随后远端核验决定。
    for name, digest in previous.get('files', {}).items():
        if name.startswith(('docs/备份的CI配置/', '备份与交接/每日进展/')):
            continue
        p = ROOT / name
        if p.is_file() and hashlib.sha256(p.read_bytes()).hexdigest() != digest:
            changed.append(name)
    changed.extend(n for n in ENTRIES if n not in previous.get('files', {}))
    change_list = ''.join(f'- `{n}`\n' for n in sorted(set(changed))) or '- 已登记文件未发现变化；新增文件以完整快照清单为准。\n'
    links = ''.join(f'- [{n}](../{n})；SHA256 `{digest}`\n' for n, digest in evidence.items())
    handoff = f'''# 伴月轩月子中心AI系统 · 持续交接说明

整理时间：{now.isoformat(timespec='seconds')}，America/Los_Angeles。
此时间表示读取资料，不代表测试通过、已上线或GitHub上传成功；成功以远端检查点标签为准。

## 新 AI 从这里开始

权威工作目录：`{ROOT}`。
私有仓库：https://github.com/Alston3825/banyuexuan-monorepo ，开发备份分支 `backup/live`。
不要从生产 `main` 误取旧开发进度。备份历史由独立镜像保存，原开发Git历史不等于备份提交历史。
先读 AGENTS.md 与交接手册，再读下面任务原文和待完善清单。保留用户已有未提交改动。
只有用户明确说“上线”才部署；不得重置真实开发库、生产库或自动上传客户资料。
复制仓库后先运行 `python3 tools/verify_backup.py`，再按恢复步骤安装依赖和找回安全配置。

## 任务与证据入口

{links}
## 当前开发任务原文（自动随源文件更新）

{task}
## 本轮登记文件变化

{change_list}
## 固定边界

- Vue3前端、NestJS API、FastAPI AI服务、MySQL和Redis；运行命令见交接手册。
- 2026-11-20核验：构建通过，单元测试5项、AI测试44项通过，业务测试333/334通过；失败原因尚待定位。此处是历史证据，后续以最新任务记录为准，不会在备份时重跑测试。
- 当时线上版本 d7526ee，服务器地址 https://fanqieai.cc；没有自动部署权限。
- 源码备份不能代替数据库、上传照片及密钥备份。外部依赖及缺失素材见资料边界；缺配置就记录阻塞，不编造凭据或假装验收。
- 每轮开发结束必须更新 docs/当前开发任务.md（需求决定、改动、验证、遗留、下一步）；机器扫描无法推断原聊天中的全部产品意图。
- 断网/关机期间不能抓取当时的本机状态；恢复后补备当前实际状态，不编造四次历史成功记录。
'''
    (folder / '交接说明.md').write_text(handoff)
    daily = folder / '每日进展' / f'{now:%Y-%m-%d}.md'
    checkpoint = (f'\n## {now.isoformat(timespec="seconds")} 检查点准备\n\n'
                  '交接资料已重新读取；推送成功须核对 GitHub 的 ai-checkpoint 标签。\n\n'
                  + change_list)
    daily.parent.mkdir(exist_ok=True)
    with daily.open('a') as handle:
        if daily.stat().st_size == 0:
            handle.write(f'# {now:%Y-%m-%d} 开发进展与备份检查点\n\n任务正文见同目录上级交接说明和 docs/当前开发任务.md。\n')
        handle.write(checkpoint)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--prepare-only', action='store_true', help='仅生成资料，不上传')
    args = parser.parse_args()
    now = dt.datetime.now(TZ)
    BASE.mkdir(parents=True, exist_ok=True)
    status = BASE / 'ai-checkpoint-status.json'
    with (BASE / 'sync.lock').open('a') as lock:
        deadline = time.monotonic() + 120
        while True:
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                if time.monotonic() >= deadline:
                    raise RuntimeError('已有备份运行超过120秒，未登记本轮成功，请稍后重试')
                time.sleep(1)
        try:
            prepare(now)
            if args.prepare_only:
                print('交接文件已生成；没有上传，不登记成功')
                return
            mirror = BASE / 'repos/ai'
            if (mirror / '.git').exists():
                if engine.git(mirror, 'branch', '--show-current') != 'backup/live':
                    raise RuntimeError('备份镜像分支异常，停止；不自动切换或覆盖')
            result = engine.snapshot(PROJECT)
            remote = engine.git(mirror, 'ls-remote', 'origin', 'refs/heads/backup/live').split()[0]
            if remote != result['commit']:
                raise RuntimeError('远端HEAD不同，未登记检查点成功')
            tag = 'ai-checkpoint/' + now.strftime('%Y%m%d-%H%M%S%z')
            engine.git(mirror, 'tag', tag, result['commit'])
            engine.git(mirror, 'push', 'origin', 'refs/tags/' + tag)
            tag_sha = engine.git(mirror, 'ls-remote', 'origin', 'refs/tags/' + tag).split()[0]
            if tag_sha != result['commit']:
                raise RuntimeError('远端检查点标签未验证，不能登记成功')
            result.update(checkpoint=tag, timezone=str(TZ), result='ok',
                          completed_at=dt.datetime.now(TZ).isoformat())
            atomic_json(status, result)
            print(json.dumps(result, ensure_ascii=False))
        except Exception as exc:
            # 失败不覆盖上次成功收据，另写最近失败状态，避免旧成功被误认成本轮。
            atomic_json(BASE / 'ai-checkpoint-last-error.json', {
                'attempted_at': now.isoformat(), 'result': 'failed', 'error': str(exc)})
            raise


if __name__ == '__main__':
    main()
