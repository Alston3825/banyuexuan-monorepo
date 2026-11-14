"""命令行试跑合同识别（调提示词/换模型后用真实合同复测准确度）。

用法（在 apps/ai-service 目录下，需已配置 .env 里的 VOLCENGINE_PLAN_*）：
    .venv/bin/python scripts/extract_contract_cli.py /path/to/合同1.pdf [/path/to/合同2.pdf ...]
每个参数是一份合同（PDF，或一张/多张照片用逗号连接：a.jpg,b.jpg,c.jpg）。
只打印结构化结果和“需要核对”的提醒，不写库、不保存图片。
"""
import asyncio
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.config import settings  # noqa: E402
from app.providers.volcengine_plan import VolcenginePlanVision  # noqa: E402
from app.vision.contract_extractor import extract_contract  # noqa: E402


async def main(args):
    if not settings.volcengine_plan_api_key or not settings.volcengine_plan_model:
        sys.exit("未配置 VOLCENGINE_PLAN_API_KEY / VOLCENGINE_PLAN_MODEL（见 .env.example）")
    vision = VolcenginePlanVision(
        settings.volcengine_plan_api_key, settings.volcengine_plan_base_url, settings.volcengine_plan_model, settings.vision_request_timeout_seconds
    )
    for arg in args:
        paths = arg.split(",")
        files = [(os.path.basename(p), open(p, "rb").read()) for p in paths]
        started = time.time()
        res = await extract_contract(files, vision)
        print("=" * 70)
        print("合同：", arg, "用时 %.0f 秒" % (time.time() - started), "模型", res["model"])
        print("页面类型：", [(p["index"], p["kind"]) for p in res["pages"]])
        print(json.dumps(res["data"], ensure_ascii=False, indent=1))
        print("--- 需要核对 ---")
        for w in res["warnings"]:
            print("[%s] %s: %s" % (w["level"], w["field"], w["message"]))


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    asyncio.run(main(sys.argv[1:]))
