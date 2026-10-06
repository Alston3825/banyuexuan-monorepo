"""命令行试跑护理表格识别：python scripts/extract_care_form_cli.py <specs.json> <表单类型> <图片...>
specs.json 由 apps/api/scripts/dump-assessment-specs.ts 导出。需要 .env 里配好火山引擎密钥。"""
import asyncio
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import settings  # noqa: E402
from app.providers.volcengine_plan import VolcenginePlanVision  # noqa: E402
from app.vision.care_form_extractor import extract_care_form  # noqa: E402


async def main() -> None:
    specs = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    spec = specs[sys.argv[2]]
    files = [(Path(p).name, Path(p).read_bytes()) for p in sys.argv[3:]]
    vision = VolcenginePlanVision(settings.volcengine_plan_api_key, settings.volcengine_plan_base_url, settings.volcengine_plan_model, settings.vision_request_timeout_seconds)
    t = time.monotonic()
    result = await extract_care_form(files, vision, spec["title"], spec["description"], spec["fields"])
    print(json.dumps(result, ensure_ascii=False, indent=1))
    print("用时 %.1fs" % (time.monotonic() - t))


asyncio.run(main())
