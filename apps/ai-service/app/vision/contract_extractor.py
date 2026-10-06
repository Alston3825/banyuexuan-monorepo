"""《母婴护理服务协议》纸质合同的读图识别。

流程：
1. 把上传的 PDF/照片渲染成逐页图片；
2. 每页并发送给读图模型，让它只抄"手写内容"并判断这是哪一页（封面/正文1/正文2/签字页/附件…）；
3. 汇总各页结果：姓名多处表决、大小写金额互校、身份证/手机/日期校验、N+N 天数拆分；
4. 手写最潦草的"预定房型/护理模式/天数"那一行，用高清图单独再读一遍，两次不一致就标黄；
5. 输出结构化数据 + 一份"需要人工核对"的提醒清单。模型只是预填，最终由销售在核对页确认。
"""
import asyncio
import base64
import json
import re
from typing import Any, Dict, List, Optional, Tuple

from ..providers.base import ModelProviderError
from . import parsing
from .pages import PageImage, render_pages

PAGE_PROMPT = """你是“伴月轩月子中心”的合同录入助手。下面是一份《母婴护理服务协议》纸质合同的一页（扫描件或照片）。
合同是统一印刷版式，客户和销售用【手写】填空。请只提取手写内容，忽略所有印刷文字。

先判断这是哪一页（page_kind）：
- cover：封面（绿色大标题“母婴护理服务协议”，右上有“编号”，下方有产妇姓名/预产期/签约日期）
- body_1：正文第1页（含“委托人（甲方）”“相关人员信息”“预产期及服务期限”）
- body_2：正文第2页（含“三、付款方式”，套餐金额、订房定金）
- body_sign：正文签字页（含“（下无正文）”，甲乙双方签字与签字日期）
- attachment：附件一~四、健康告知书（大多只有客户签字和日期）
- back_cover：封底
- other：其他

只输出一个 JSON 对象（不要 Markdown 代码块，不要任何解释），字段如下，读不到或该页没有的填 null：
{
 "page_kind": "...",
 "printed_page_no": 页脚印刷的页码数字（“第N页共M页”的N），没有则 null,
 "mother_name": 产妇姓名手写原文,
 "contract_no": 封面右上角“编号”后手写的编号原文（保留原有分隔，如 2026 08 363）,
 "due_date_text": 预产期手写原文（正文里年/月/日是分开的三栏，请拼成 2027-1-19 这种）,
 "signed_date_text": 封面“签约日期”手写原文,
 "id_card_no": 身份证号码,
 "hospital": 产检医院,
 "phone": 产妇联系电话,
 "address": 家庭地址,
 "emergency_name": 紧急联系人,
 "emergency_relation": 与甲方的关系,
 "emergency_phone": 紧急联系人联系电话,
 "fetus": "single" / "twin" / "multi"（看方框里打勾的是单胎/双胎/其他），没勾选则 null,
 "room_type_text": 第二部分第3条“预定____房”横线上手写的原文（可能含房型名、间数、朝向等）,
 "care_mode_text": “____护理模式”前面横线上手写的原文（如 一对一、一对二）,
 "days_text": “____天套餐”前面横线上手写的原文（如 28、28+28）,
 "package_upper": 付款方式第1条套餐金额的大写手写原文（各栏拼成一句，如 贰万玖仟捌佰零拾零元零角零分）,
 "package_lower": 套餐金额小写数字,
 "deposit_upper": 付款方式第2条订房定金的大写,
 "deposit_lower": 订房定金小写数字,
 "signature_name": 客户签字处手写的姓名（签名字迹，尽力辨认）,
 "sign_date_text": 客户签字日期手写原文,
 "gift_items": [ {"name": "赠送/加赠/优惠的项目名", "quantity": "数量或次数原文", "legible": true 或 false} ],
 "extra_handwriting": [ {"where": "位置描述", "text": "内容原文", "legible": true 或 false} ],
 "unclear_fields": ["字迹潦草、看不清、你没有把握的字段名"]
}
规则：
1. 只按看到的样子原样抄写，看不清的字用 [?] 代替，不要凭常识猜测或补全；
2. 姓名、金额、日期、电话、身份证号要特别仔细，数字逐位核对；
3. gift_items 只收手写的“赠送/加赠/优惠/免费/送”类内容；extra_handwriting 收除上述所有字段以外的其它手写内容（手写备注、涂改、补充条款等）。以下都【不算】extra_handwriting，不要收：甲方和乙方（公司代表）的签名、任何签字日期、大宝姓名/性别/年龄/监护人签字、公章、页面边缘的骑缝章及其残影上的文字；
4. 金额大写栏里，手写的叉号（⊗ ×）、圆圈（○）或空白，表示这一位是零，请写“零”，不要误读成别的数字；
5. 没有任何手写的印刷页，所有字段填 null，gift_items 与 extra_handwriting 填 []。"""

AMOUNT_FOCUS_PROMPT = """这是《母婴护理服务协议》正文第2页的高清图。请只看“三、付款方式”：
第1条“套餐金额为：人民币 __万__仟__佰__拾__元__角__分（￥____元）”
第2条“……交纳：人民币 __万__仟__佰__拾__元__角__分（￥____元）作为订房定金”。
请分别读出这两笔钱的手写内容：大写（各栏拼成一句）和小写数字。
注意：大写各栏里手写的叉号（⊗ ×）、圆圈（○）或空白，表示这一位是零，请写“零”；原样抄写，看不清的字用 [?] 代替，不要猜测。
只输出一个 JSON 对象，不要 Markdown、不要解释：
{"package_upper": "...", "package_lower": "...", "deposit_upper": "...", "deposit_lower": "...", "legible": true 或 false}"""

FOCUS_PROMPT = """这是《母婴护理服务协议》正文第1页的高清图。请只找到“二、预产期及服务期限”里的第3条：
“甲方预定房型及休养期：预定 ______ 房 ______ 护理模式 ______ 天套餐”。
这句话里有三个手写的横线，请分别读出手写原文（原样抄写，看不清的字用 [?] 代替，不要猜测或补全）：
1) room_type_text：“预定”后、“房”字前的第一个横线（可能含房型名、间数、朝向等说明）；
2) care_mode_text：“护理模式”四个字【前面】的横线（如 一对一、一对二）；
3) days_text：“天套餐”三个字【前面】的横线（如 28、28+28）。
另外请读出“一、相关人员信息”里三个手写号码（数字逐位仔细核对，看不清的位用 ? 代替）：
4) id_card_no：入住产妇的身份证号码（18位，最后一位可能是 X）；
5) phone：产妇的联系电话（11位）；
6) emergency_phone：紧急联系人的联系电话（11位）。
只输出一个 JSON 对象，不要 Markdown、不要解释：
{"room_type_text": "...", "care_mode_text": "...", "days_text": "...", "id_card_no": "...", "phone": "...", "emergency_phone": "...", "legible": true 或 false}"""

# 对同一页“再读”的次数与清晰度：每次略有不同，做多数表决，减少单次读错
FOCUS_SIZES = (2600, 2200, 1800)

# 用户确认：赠送项目一般写在正文第1页或第6页（第6页即签字页）
GIFT_PAGE_KINDS = ("body_1", "body_sign")


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


def _clean(v: Any) -> Optional[str]:
    if v is None:
        return None
    s = str(v).strip()
    return s if s and s.lower() not in ("null", "none", "无") else None


def _warn(warnings: List[Dict[str, Any]], field: str, level: str, message: str, page: Optional[int] = None) -> None:
    warnings.append({"field": field, "level": level, "message": message, "page": page})


def _norm_room(text: str) -> str:
    """比较两次房型识别是否一致时，忽略空格、括号种类、结尾的“房”字。"""
    s = re.sub(r"[\s（）()\[\]]", "", text)
    return re.sub(r"房$", "", s)


def _as_list(v: Any) -> List[Dict[str, Any]]:
    if not v:
        return []
    return [x for x in (v if isinstance(v, list) else [v]) if isinstance(x, dict)]


def _vote_texts(values: List[str], key=lambda s: s) -> Tuple[Optional[str], bool]:
    """对若干次读出的文字多数表决（按 key 归并）。返回 (胜出的原文, 是否全部一致)；并列时取最先出现的。"""
    groups: Dict[Any, List[str]] = {}
    for v in values:
        groups.setdefault(key(v), []).append(v)
    if not groups:
        return None, True
    best = max(groups.values(), key=len)  # max 遇并列取先出现者（dict 保持插入顺序）
    return best[0], len(groups) == 1


def _vote_digits(values: List[str], validator) -> Tuple[Optional[str], Optional[str], bool]:
    """号码类字段（身份证/手机）表决：优先只在“通过校验”的候选里投票。
    返回 (采用的号码, 问题描述, 通过校验的候选之间是否一致)。"""
    normed = []
    for v in values:
        n, issue = validator(v)
        if n:
            normed.append((n, issue))
    if not normed:
        return None, None, True
    valid = [n for n, issue in normed if issue is None]
    if valid:
        win, agree = _vote_texts(valid)
        return win, None, agree
    win, _ = _vote_texts([n for n, _ in normed])
    return win, next(issue for n, issue in normed if n == win), False


def _vote_amount(cands: List[Tuple[float, str]]) -> Tuple[Optional[float], bool]:
    """多个来源（整页识别的大/小写 + 高清再读的大/小写）对同一笔金额的候选值多数表决。
    返回 (采用的金额, 是否足够确定)。“足够确定”＝得票不少于 2 票且占全部候选的 3/4 以上；
    否则采用第一个候选（小写）并视为“有分歧”，交给人工核对。"""
    if not cands:
        return None, True
    counts: Dict[float, int] = {}
    for v, _ in cands:
        counts[round(v, 2)] = counts.get(round(v, 2), 0) + 1
    best = max(counts.items(), key=lambda kv: kv[1])
    confident = best[1] >= 2 and best[1] * 4 >= len(cands) * 3
    if best[1] >= 2:
        return best[0], confident
    return cands[0][0], False


def aggregate(
    page_results: List[Dict[str, Any]],
    focus: Any = None,
    focus_amounts: Any = None,
) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    """汇总逐页结果 → (结构化数据, 核对提醒)。纯函数，方便用假数据做单元测试。
    focus / focus_amounts：对正文第1页、第2页高清“再读”的若干次结果（列表；传单个 dict 也行），
    与整页识别一起做多数表决。"""
    focus_list = _as_list(focus)
    amount_list = _as_list(focus_amounts)
    warnings: List[Dict[str, Any]] = []
    by_kind: Dict[str, List[Dict[str, Any]]] = {}
    for r in page_results:
        by_kind.setdefault(r.get("page_kind") or "other", []).append(r)

    def pick(field: str, kinds: Tuple[str, ...]) -> List[Tuple[str, int]]:
        out = []
        for k in kinds:
            for r in by_kind.get(k, []):
                v = _clean(r.get(field))
                if v:
                    out.append((v, r["_page"]))
        return out

    data: Dict[str, Any] = {}

    # —— 姓名：封面 + 正文第1页手写栏为准（权重2），签字页笔迹辨认较难只作参考（权重1）——
    name_cands = [(v, 2) for v, _ in pick("mother_name", ("cover", "body_1", "body_2"))]
    sig_cands = [(v, 1) for v, _ in pick("signature_name", ("body_sign", "attachment", "body_1", "body_2"))]
    name, variants = parsing.most_common_name(name_cands + sig_cands)
    data["mother_name"] = name
    if not name:
        _warn(warnings, "mother_name", "missing", "没有识别到产妇姓名")
    else:
        field_variants = {n for n, _ in name_cands if re.sub(r"\s", "", n)}
        field_variants = {re.sub(r"\s", "", n) for n in field_variants}
        if len(field_variants) > 1:
            _warn(warnings, "mother_name", "warn", "封面与正文里的姓名不一致：%s，请对照原图核对" % " / ".join(sorted(field_variants)))
        elif len(variants) > 1:
            _warn(warnings, "mother_name", "warn", "签名笔迹与填写的姓名有出入（%s），请确认" % " / ".join(variants))

    # —— 编号 / 日期 ——
    cn = pick("contract_no", ("cover",))
    data["contract_no"] = re.sub(r"\s+", "-", cn[0][0].strip()) if cn else None
    if not data["contract_no"]:
        _warn(warnings, "contract_no", "missing", "没有识别到合同编号（封面右上角）")

    signed = [parsing.parse_date(v) for v, _ in pick("signed_date_text", ("cover",))]
    signed = [d for d in signed if d]
    if not signed:
        sign_dates = [parsing.parse_date(_clean(r.get("sign_date_text"))) for r in page_results]
        counts: Dict[str, int] = {}
        for d in sign_dates:
            if d:
                counts[d] = counts.get(d, 0) + 1
        signed = [max(counts, key=counts.get)] if counts else []
    data["signed_date"] = signed[0] if signed else None
    if not data["signed_date"]:
        _warn(warnings, "signed_date", "missing", "没有识别到签约日期")

    due_texts = pick("due_date_text", ("cover", "body_1"))
    dues = [parsing.parse_date(v) for v, _ in due_texts]
    valid_dues = [d for d in dues if d]
    data["due_date"] = valid_dues[0] if valid_dues else None
    if not valid_dues:
        _warn(warnings, "due_date", "missing", "没有识别到预产期")
    elif len(set(valid_dues)) > 1:
        _warn(warnings, "due_date", "warn", "封面与正文里的预产期不一致：%s，请核对" % " / ".join(sorted(set(valid_dues))))

    # —— 基本信息（正文第1页）——
    def samples(field: str) -> List[str]:
        """整页识别 + 各次高清再读 对同一号码字段读出的所有候选。"""
        vals = [v for v, _ in pick(field, ("body_1",))]
        vals += [x for x in (_clean(f.get(field)) for f in focus_list) if x]
        return vals

    idno, id_issue, id_agree = _vote_digits(samples("id_card_no"), parsing.validate_id_card)
    data["id_card_no"] = idno
    if not idno:
        _warn(warnings, "id_card_no", "missing", "没有识别到身份证号")
    elif id_issue:
        _warn(warnings, "id_card_no", "warn", id_issue + "（多次识别都没有通过校验，请对照原图逐位核对）")
    elif not id_agree:
        _warn(warnings, "id_card_no", "warn", "身份证号多次识别有出入，已采用通过校验位的结果，请对照原图核对")

    for key, field, label in (("phone", "phone", "联系电话"), ("emergency_phone", "emergency_phone", "紧急联系人电话")):
        num, issue, agree = _vote_digits(samples(field), parsing.validate_phone)
        data[key] = num
        if not num:
            if key == "phone":
                _warn(warnings, key, "missing", "没有识别到联系电话")
        elif issue:
            _warn(warnings, key, "warn", label + "：" + issue + "，请对照原图核对")
        elif not agree:
            _warn(warnings, key, "warn", label + "多次识别有出入，请对照原图核对")

    for f in ("hospital", "address", "emergency_name", "emergency_relation"):
        v = pick(f, ("body_1",))
        data[f] = v[0][0] if v else None

    fetus = pick("fetus", ("body_1",))
    data["fetus"] = fetus[0][0] if fetus and fetus[0][0] in ("single", "twin", "multi") else None

    # —— 套餐行：以高清单独再读的结果为准，与整页识别对比 ——
    # 整页识别 + 各次高清再读，一起多数表决；不一致就提醒核对，并列出各次读到的原文
    def line_samples(field: str) -> List[str]:
        vals = [v for v, _ in pick(field, ("body_1",))]
        vals += [x for x in (_clean(f.get(field)) for f in focus_list) if x]
        return vals

    room_text, room_agree = _vote_texts(line_samples("room_type_text"), _norm_room)
    mode_vals = line_samples("care_mode_text")
    mode_text, mode_agree = _vote_texts(mode_vals, lambda s: parsing.parse_care_mode(s) or s)
    days_vals = line_samples("days_text")
    days_text, days_agree = _vote_texts(days_vals, lambda s: parsing.parse_days(s))
    if not room_agree:
        _warn(warnings, "room_type_text", "warn", "房型多次识别不一致（%s），请对照原图确认" % " / ".join(dict.fromkeys(line_samples("room_type_text"))))
    if not mode_agree:
        _warn(warnings, "care_mode", "warn", "护理模式多次识别不一致（%s），请对照原图确认" % " / ".join(dict.fromkeys(mode_vals)))
    if not days_agree:
        _warn(warnings, "days_text", "warn", "套餐天数多次识别不一致（%s），请对照原图确认" % " / ".join(dict.fromkeys(days_vals)))
    if focus_list and sum(1 for f in focus_list if f.get("legible") is False) * 2 > len(focus_list):
        _warn(warnings, "room_type_text", "warn", "套餐一行字迹潦草，请对照原图确认房型、护理模式、天数")

    data["room_type_text"] = room_text
    data["orientation"] = parsing.parse_orientation(room_text)
    data["care_mode"] = parsing.parse_care_mode(mode_text)
    data["days_text"] = days_text
    in_days, home_days = parsing.parse_days(days_text)
    data["in_house_days"], data["home_service_days"] = in_days, home_days
    if not room_text:
        _warn(warnings, "room_type_text", "missing", "没有识别到预定房型")
    if not mode_text:
        _warn(warnings, "care_mode", "missing", "没有识别到护理模式")
    elif not data["care_mode"]:
        _warn(warnings, "care_mode", "warn", "护理模式「%s」无法归类为 1对1 / 1对2，请手工选择" % mode_text)
    if in_days is None:
        _warn(warnings, "in_house_days", "missing" if not days_text else "warn", "没有识别到套餐天数" if not days_text else "套餐天数「%s」无法解析，请手工填写" % days_text)
    elif not (7 <= in_days <= 120):
        _warn(warnings, "in_house_days", "warn", "入住天数 %d 天不太常见，请核对" % in_days)

    # —— 金额：大写小写互校 ——
    for key, label, upper_f, lower_f in (
        ("package_amount", "套餐金额", "package_upper", "package_lower"),
        ("deposit_amount", "订房定金", "deposit_upper", "deposit_lower"),
    ):
        upper_txt = (pick(upper_f, ("body_2",)) or [(None, 0)])[0][0]
        lower_raw = (pick(lower_f, ("body_2",)) or [(None, 0)])[0][0]
        # 来源：整页识别的小写/大写 + 每次高清再读的小写/大写；小写更不容易读错，排在前面
        cands = []
        pairs = [(parsing.to_number(lower_raw), "整页小写"), (parsing.upper_amount_to_yuan(upper_txt), "整页大写")]
        for n, f in enumerate(amount_list, start=1):
            pairs.append((parsing.to_number(_clean(f.get(lower_f))), "高清%d小写" % n))
            pairs.append((parsing.upper_amount_to_yuan(_clean(f.get(upper_f))), "高清%d大写" % n))
        for val, src in pairs:
            if val is not None:
                cands.append((val, src))
        chosen, all_agree = _vote_amount(cands)
        data[key] = chosen
        if chosen is None:
            _warn(warnings, key, "missing", "没有识别到%s" % label)
        elif not all_agree:
            detail = "、".join("%s %g" % (s, v) for v, s in cands)
            _warn(warnings, key, "warn", "%s多次识别结果不完全一致（%s），已采用出现次数最多的 %g 元，请对照原图核对" % (label, detail, chosen))
        elif len(cands) < 2:
            _warn(warnings, key, "warn", "%s只有一个识别结果，无法互相校验，请核对" % label)
    if data["package_amount"] and data["deposit_amount"] and data["deposit_amount"] > data["package_amount"]:
        _warn(warnings, "deposit_amount", "warn", "订房定金大于套餐金额，请核对")

    # —— 赠送项目：一般写在正文第1页或第6页（签字页）——
    gifts: List[Dict[str, Any]] = []
    for r in page_results:
        for g in r.get("gift_items") or []:
            name_g = _clean(g.get("name")) if isinstance(g, dict) else None
            if not name_g:
                continue
            legible = g.get("legible") is not False and "[?]" not in name_g and "[?]" not in str(g.get("quantity") or "")
            gifts.append({"name": name_g, "quantity": _clean(g.get("quantity")), "needs_review": not legible, "page": r["_page"]})
    data["gift_items"] = gifts
    if any(g["needs_review"] for g in gifts):
        _warn(warnings, "gift_items", "warn", "合同上有手写赠送内容，但部分字迹看不清，请对照原图核对并修改")
    extras = []
    for r in page_results:
        for e in r.get("extra_handwriting") or []:
            text = _clean(e.get("text")) if isinstance(e, dict) else None
            if text:
                extras.append({"where": _clean(e.get("where")), "text": text, "page": r["_page"], "kind": r.get("page_kind")})
    data["extra_notes"] = extras
    # 模型有时会把已识别的固定栏位（姓名、房型、勾选…）又当成“额外手写”报出来，这里按已识别的值兜底剔除
    known = [re.sub(r"[\s（）()\[\]?]", "", str(v)) for v in data.values() if isinstance(v, (str, int, float)) and v]
    for r in page_results:
        for k, v in r.items():
            if isinstance(v, str) and not k.startswith("_") and k != "page_kind":
                known.append(re.sub(r"[\s（）()\[\]?]", "", v))
    known = [k for k in known if len(k) >= 1]
    for e in extras:
        # 签字、日期、骑缝章一类已在提示词里排除；这里再兜底过滤一次，避免签字页上的乙方签字/日期被当成"赠送"
        if re.search(r"签字|签名|日期|骑缝|专用章", (e.get("where") or "")) or re.fullmatch(r"[\d年月日\s\[\]?./\-]+", e["text"]):
            continue
        norm = re.sub(r"[\s（）()\[\]?]", "", e["text"])
        if len(norm) <= 1 or norm in ("√", "✓", "✔") or any(norm in k or (len(k) >= 2 and k in norm) for k in known):
            continue
        if e["kind"] in GIFT_PAGE_KINDS:
            _warn(warnings, "gift_items", "warn", "第%d页有手写内容「%s」，可能是赠送项目或备注，请核对" % (e["page"], e["text"]), e["page"])
        elif e["kind"] in ("cover", "body_2"):
            _warn(warnings, "extra_notes", "info", "第%d页有额外手写内容「%s」，请留意" % (e["page"], e["text"]), e["page"])
        # 附件页、封底、其他页的零星手写（多是签字、章的残影）只保留在 extra_notes 数据里，不提醒

    # —— 模型自己标出的"没把握"字段 ——
    field_alias = {
        "package_upper": "package_amount", "package_lower": "package_amount",
        "deposit_upper": "deposit_amount", "deposit_lower": "deposit_amount",
        "due_date_text": "due_date", "signed_date_text": "signed_date",
        "care_mode_text": "care_mode",
    }
    seen = set()
    for r in page_results:
        for f in r.get("unclear_fields") or []:
            key = field_alias.get(str(f), str(f))
            if key in data and key not in seen and not any(w["field"] == key and w["level"] != "info" for w in warnings):
                seen.add(key)
                _warn(warnings, key, "warn", "该项字迹不清晰，请对照原图核对", r["_page"])
    return data, warnings


async def _empty() -> List[Dict[str, Any]]:
    return []


async def extract_contract(files: List[Tuple[str, bytes]], vision, concurrency: int = 4) -> Dict[str, Any]:
    pages: List[PageImage] = render_pages(files)
    sem = asyncio.Semaphore(concurrency)
    model_used: List[str] = []

    async def read_page(p: PageImage) -> Dict[str, Any]:
        async with sem:
            text, model = await vision.read_images([p.jpeg], PAGE_PROMPT, 2200)
        model_used.append(model)
        obj = _parse_json(text)
        if obj is None:
            raise ModelProviderError("第%d页返回内容不是有效 JSON" % p.index)
        obj["_page"] = p.index
        return obj

    raw = await asyncio.gather(*[read_page(p) for p in pages], return_exceptions=True)
    page_results: List[Dict[str, Any]] = []
    failed: List[int] = []
    for p, r in zip(pages, raw):
        if isinstance(r, Exception):
            failed.append(p.index)
        else:
            page_results.append(r)

    async def focus_reads(page: PageImage, prompt: str) -> List[Dict[str, Any]]:
        """对同一页用不同清晰度各再读一遍（并发），返回读到的有效结果。"""

        async def one(size: int) -> Optional[Dict[str, Any]]:
            try:
                async with sem:
                    text, _ = await vision.read_images([page.hires(size)], prompt, 700)
            except ModelProviderError:
                return None
            return _parse_json(text)

        return [r for r in await asyncio.gather(*[one(s) for s in FOCUS_SIZES]) if r]

    body1 = next((r for r in page_results if r.get("page_kind") == "body_1"), None)
    body2 = next((r for r in page_results if r.get("page_kind") == "body_2"), None)
    focus, focus_amounts = await asyncio.gather(
        focus_reads(pages[body1["_page"] - 1], FOCUS_PROMPT) if body1 is not None else _empty(),
        focus_reads(pages[body2["_page"] - 1], AMOUNT_FOCUS_PROMPT) if body2 is not None else _empty(),
    )

    data, warnings = aggregate(page_results, focus, focus_amounts)
    for idx in failed:
        _warn(warnings, "pages", "warn", "第%d页识别失败，请检查该页图片是否清晰，或手工录入" % idx, idx)
    if body1 is None:
        _warn(warnings, "pages", "warn", "没有找到正文第1页（含身份证、房型、护理模式），这些信息请手工录入或补传该页")

    return {
        "data": data,
        "warnings": warnings,
        "pages": [
            {
                "index": p.index,
                "kind": next((r.get("page_kind") for r in page_results if r["_page"] == p.index), None),
                "printed_page_no": next((r.get("printed_page_no") for r in page_results if r["_page"] == p.index), None),
                "source_name": p.source_name,
                "jpeg_b64": base64.b64encode(p.jpeg).decode(),
            }
            for p in pages
        ],
        "raw_pages": page_results,
        "focus": focus,
        "focus_amounts": focus_amounts,
        "model": model_used[0] if model_used else None,
    }
