"""护理纸质表格（入所/出所评估单等）的通用读图识别。

和合同识别的区别：表格的字段说明书由调用方（后端的 assessment-specs）随请求传进来，
这里按说明书动态生成提示词，所以新增/调整字段不用改 AI 服务代码。

流程：
1. 把照片/PDF 渲染成图片（支持苹果 HEIC）；
2. 同一份表格用两种清晰度各读一遍（并发），按字段说明书输出 JSON；
3. 两次结果逐字段对比：一致 → 采用；不一致 → 采用高清那次并提醒人工核对；
   只有一次读到 → 采用并提醒；数值超出合理范围 / 选项不在选项表里 → 提醒；
4. 模型自己标出的"字迹不清/没把握"字段 → 提醒。
识别结果只是预填，写入数据库前必须由录入者在复核页确认。
"""
import asyncio
import json
import re
from datetime import date
from typing import Any, Dict, List, Optional, Tuple

from ..providers.base import ModelProviderError
from .pages import PageImage, render_pages

# 两次读图的清晰度（长边像素）：整页普通档 + 高清档
READ_SIZES = (1800, 2600)

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _table_desc(f: Dict[str, Any]) -> str:
    cols = []
    for c in f.get("columns") or []:
        d = "%s（%s）：%s" % (c["key"], c["label"], _kind_desc(c))
        if c.get("aiHint"):
            d += "。注意：" + c["aiHint"]
        cols.append("    · " + d)
    return "表格，输出 JSON 数组，纸上每一行写了内容的就是数组里的一个对象（按从上到下的顺序，空行不要输出），对象的 key 如下：\n" + "\n".join(cols)


def _kind_desc(f: Dict[str, Any]) -> str:
    kind = f.get("kind")
    if kind == "table":
        return _table_desc(f)
    opts = f.get("options") or []
    if kind == "single":
        choices = "；".join("%s=%s" % (o["value"], o["label"]) for o in opts)
        return "单选，只输出一个代码（%s），没勾选填 null" % choices
    if kind == "multi":
        choices = "；".join("%s=%s" % (o["value"], o["label"]) for o in opts)
        return "多选，输出代码数组（%s），一个都没勾选填 null" % choices
    if kind == "int":
        return "整数" + ("，单位 %s" % f["unit"] if f.get("unit") else "")
    if kind == "decimal":
        return "数字（可带小数）" + ("，单位 %s" % f["unit"] if f.get("unit") else "")
    if kind == "date":
        return "日期，输出 YYYY-MM-DD"
    if kind == "longtext":
        return "多行手写文字，按行抄写，行与行之间用换行符"
    return "手写文字，原样抄写"


def build_prompt(form_title: str, description: str, fields: List[Dict[str, Any]], today: date) -> str:
    lines = []
    for f in fields:
        line = "- %s（%s）：%s" % (f["key"], f["label"], _kind_desc(f))
        if f.get("aiHint"):
            line += "。注意：" + f["aiHint"]
        lines.append(line)
    return (
        "你是“伴月轩月子中心”的护理档案录入助手。下面是一份《%s》的照片（可能有多张，是同一份表格的不同页）。\n"
        "%s\n"
        "请把表格里【手写和打钩】的内容读出来，按下面的字段说明输出。印刷的表头和栏目名不用抄。\n\n"
        "字段说明（key（含义）：类型）：\n%s\n\n"
        "只输出一个 JSON 对象（不要 Markdown 代码块，不要解释），key 必须和上面完全一致，读不到或没填的写 null，另外加一个字段：\n"
        '"unclear_fields": ["字迹潦草、看不清、你没有把握的字段 key"]\n\n'
        "规则：\n"
        "1. 勾选框：只有明确打了勾（✓、√、☑、涂黑）的才算选中；画斜线/叉划掉的表示没有这项，不要选；\n"
        "2. 数字（体温、血压、体重、黄疸值等）逐位仔细核对，看不清的字段放进 unclear_fields，不要猜；\n"
        "3. 手写日期常常没有年份（如 8.24 或 24/8）。年份缺省时按 %d 年补全；如果补全后的日期比今天（%s）还晚，就用上一年；\n"
        "4. 姓名、房号、签名栏：只抄“评估人员/责任护士/家属签字”这类签名字面，字迹难辨时尽力辨认并放进 unclear_fields；\n"
        "5. 页面边缘的骑缝章、水印、装订孔不要当成内容。"
        % (form_title, description, "\n".join(lines), today.year, today.isoformat())
    )


def _parse_json(text: str) -> Optional[Dict[str, Any]]:
    s = text.strip()
    s = re.sub(r"^```(?:json)?", "", s).strip()
    s = re.sub(r"```$", "", s).strip()
    start, end = s.find("{"), s.rfind("}")
    if start < 0 or end <= start:
        return None
    try:
        obj = json.loads(s[start : end + 1])
    except ValueError:
        return None
    return obj if isinstance(obj, dict) else None


def _num(v: Any) -> Optional[float]:
    if v is None or isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    m = re.search(r"-?\d+(?:\.\d+)?", str(v))
    return float(m.group()) if m else None


def _norm_table(f: Dict[str, Any], v: Any) -> Optional[List[Dict[str, Any]]]:
    if not isinstance(v, list):
        return None
    cols = f.get("columns") or []
    rows = []
    for r in v:
        if not isinstance(r, dict):
            continue
        row = {}
        for c in cols:
            n = _norm_value(c, r.get(c["key"]))
            if n is not None:
                row[c["key"]] = n
        if row:
            rows.append(row)
    return rows or None


def _norm_value(f: Dict[str, Any], v: Any) -> Any:
    """把模型输出规整成该字段类型的值；无法规整返回 None（并交给调用方提醒）。"""
    if v is None:
        return None
    kind = f.get("kind")
    if kind == "table":
        return _norm_table(f, v)
    values = {o["value"] for o in (f.get("options") or [])}
    if kind == "single":
        s = str(v).strip()
        return s if s in values else None
    if kind == "multi":
        arr = v if isinstance(v, list) else [v]
        out = [str(x).strip() for x in arr if str(x).strip() in values]
        return out or None
    if kind == "int":
        n = _num(v)
        return int(round(n)) if n is not None else None
    if kind == "decimal":
        n = _num(v)
        return round(n, 2) if n is not None else None
    if kind == "date":
        s = str(v).strip()
        return s if DATE_RE.match(s) else None
    s = str(v).strip()
    # 时间统一成 HH:mm（2:00 和 02:00 是同一个时间，不要当成两次识别不一致）
    m = re.fullmatch(r"(\d{1,2})[:：](\d{2})", s)
    if m:
        s = "%02d:%s" % (int(m.group(1)), m.group(2))
    # 纸上用一条斜线表示"这一栏没有/不适用"，不是内容
    return s if s and s.lower() not in ("null", "none") and s not in ("/", "／", "\\", "—", "-") else None


def _same(a: Any, b: Any) -> bool:
    if isinstance(a, list) and isinstance(b, list):
        return sorted(a) == sorted(b)
    if isinstance(a, str) and isinstance(b, str):
        return re.sub(r"\s+", "", a) == re.sub(r"\s+", "", b)
    return a == b


def _show(f: Dict[str, Any], v: Any) -> str:
    labels = {o["value"]: o["label"] for o in (f.get("options") or [])}
    if isinstance(v, list):
        return "、".join(labels.get(x, x) for x in v)
    return labels.get(v, str(v)) if v is not None else "空"


def _merge_table(f: Dict[str, Any], reads: List[Dict[str, Any]], data: Dict[str, Any], warnings: List[Dict[str, str]]) -> None:
    """表格字段：采用最后一次（高清）读到的行；两次行数不同整体提醒；同一行同一格不同逐格提醒（field=key.行号.列key，行号从 0 起）。"""
    key, label = f["key"], f["label"]
    tables = [t for t in (_norm_table(f, r.get(key)) for r in reads) if t]
    if not tables:
        return
    final = tables[-1]
    data[key] = final
    cols = {c["key"]: c for c in (f.get("columns") or [])}
    if len(tables) >= 2 and len(tables[0]) != len(final):
        warnings.append({"field": key, "level": "warn", "message": "%s：两次识别的行数不一致（%d / %d 行），请对照原图核对每一行是否漏读或多读" % (label, len(tables[0]), len(final))})
    elif len(tables) >= 2:
        diff = 0
        for i, row in enumerate(final):
            other = tables[0][i]
            for ck, c in cols.items():
                a, b = other.get(ck), row.get(ck)
                if c.get("kind") in ("int", "decimal"):
                    # 数字格：空格 和 0 是一回事（亲喂/母乳/喂水整列空着时，一次读成 0、一次读成空，不该标黄）
                    a = None if a in (0, 0.0) else a
                    b = None if b in (0, 0.0) else b
                if (a is not None or b is not None) and not _same(a, b):
                    diff += 1
                    warnings.append({"field": "%s.%d.%s" % (key, i, ck), "level": "warn", "message": "第 %d 行「%s」两次识别不一致（%s / %s），请核对" % (i + 1, c["label"], _show(c, a), _show(c, b))})
        if diff:
            warnings.append({"field": key, "level": "warn", "message": "%s：有 %d 个格子两次识别不一致（已在对应格子标黄），请对照原图核对" % (label, diff)})
    for i, row in enumerate(final):
        for ck, c in cols.items():
            v = row.get(ck)
            if isinstance(v, (int, float)) and c.get("kind") in ("int", "decimal"):
                lo, hi = c.get("min"), c.get("max")
                if (lo is not None and v < lo) or (hi is not None and v > hi):
                    warnings.append({"field": "%s.%d.%s" % (key, i, ck), "level": "warn", "message": "第 %d 行「%s」%g 超出常见范围，请核对" % (i + 1, c["label"], v)})


def merge_reads(fields: List[Dict[str, Any]], reads: List[Dict[str, Any]]) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    """多次读图结果合并 → (字段值, 提醒)。reads 顺序：先普通档，后高清档（冲突时以最后一个有值的为准）。纯函数，便于单元测试。"""
    data: Dict[str, Any] = {}
    warnings: List[Dict[str, str]] = []
    unclear = {str(k) for r in reads for k in (r.get("unclear_fields") or [])}
    for f in fields:
        key, label = f["key"], f["label"]
        if f.get("kind") == "table":
            _merge_table(f, reads, data, warnings)
            continue
        vals = [_norm_value(f, r.get(key)) for r in reads]
        raw_present = [r.get(key) for r in reads if r.get(key) not in (None, "", [])]
        got = [v for v in vals if v is not None]
        if raw_present and not got:
            warnings.append({"field": key, "level": "warn", "message": "%s：读到的内容「%s」不在可选项里，请对照原图手工选择" % (label, raw_present[0])})
        if not got:
            continue
        value = got[-1]
        data[key] = value
        if len(got) >= 2 and not all(_same(got[0], g) for g in got[1:]):
            shown = " / ".join(dict.fromkeys(_show(f, g) for g in got))
            warnings.append({"field": key, "level": "warn", "message": "%s：两次识别不一致（%s），请对照原图核对" % (label, shown)})
        elif len(got) < len(reads) and f.get("kind") in ("int", "decimal"):
            warnings.append({"field": key, "level": "info", "message": "%s：只有一次识别到，请核对" % label})
        if f.get("kind") in ("int", "decimal") and isinstance(value, (int, float)):
            lo, hi = f.get("min"), f.get("max")
            if (lo is not None and value < lo) or (hi is not None and value > hi):
                warnings.append({"field": key, "level": "warn", "message": "%s：%g 超出常见范围（%g ~ %g），请核对是否多打/少打了一位" % (label, value, lo if lo is not None else float("-inf"), hi if hi is not None else float("inf"))})
        if key in unclear and not any(w["field"] == key and w["level"] == "warn" for w in warnings):
            warnings.append({"field": key, "level": "warn", "message": "%s：字迹不清晰，请对照原图核对" % label})
    # 模型标了"没把握"但最终没读到值的字段，也提醒一下（需要人工补）
    known = {f["key"]: f["label"] for f in fields}
    for k in sorted(unclear):
        if k in known and k not in data:
            warnings.append({"field": k, "level": "warn", "message": "%s：字迹不清晰，没有识别出来，请对照原图手工填写" % known[k]})
    return data, warnings


async def extract_care_form(
    files: List[Tuple[str, bytes]],
    vision,
    form_title: str,
    description: str,
    fields: List[Dict[str, Any]],
    today: Optional[date] = None,
) -> Dict[str, Any]:
    today = today or date.today()
    pages: List[PageImage] = render_pages(files)
    prompt = build_prompt(form_title, description, fields, today)

    async def one(size: int) -> Optional[Dict[str, Any]]:
        images = [p.jpeg if size == READ_SIZES[0] else p.hires(size) for p in pages]
        text, model = await vision.read_images(images, prompt, 4000)
        obj = _parse_json(text)
        if obj is None:
            raise ModelProviderError("模型返回的内容不是有效 JSON")
        obj["_model"] = model
        return obj

    results = await asyncio.gather(*[one(s) for s in READ_SIZES], return_exceptions=True)
    reads = [r for r in results if isinstance(r, dict)]
    if not reads:
        err = next((r for r in results if isinstance(r, Exception)), None)
        raise ModelProviderError("识别失败：%s" % (err or "未知错误"))
    data, warnings = merge_reads(fields, reads)
    if len(reads) < len(results):
        warnings.append({"field": "_all", "level": "info", "message": "有一次读图失败，只用了一次识别结果，请更仔细地核对"})
    return {"data": data, "warnings": warnings, "model": reads[0].get("_model"), "page_count": len(pages)}
