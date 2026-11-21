#!/usr/bin/env python3
"""在独立clone的backup/live或检查点标签中逐文件验证备份。"""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    manifest = json.loads((ROOT / 'docs/源码文件校验清单.json').read_text())
    if not manifest:
        raise SystemExit('校验清单为空，不能认定备份完整')
    failed = []
    for name, digest in manifest.items():
        rel = Path(name)
        if rel.is_absolute() or '..' in rel.parts:
            raise SystemExit('清单包含不安全路径')
        p = ROOT / rel
        if p.is_symlink() or not p.is_file() or hashlib.sha256(p.read_bytes()).hexdigest() != digest:
            failed.append(name)
    if failed:
        raise SystemExit('校验失败：' + ', '.join(failed))
    print(f'校验通过：{len(manifest)} 个源码/资料文件；生成的快照和校验清单不包含自身哈希。')
    print('这只证明备份文件一致，不代表功能已验收、生产数据已恢复或依赖已安装。')


if __name__ == '__main__':
    main()
