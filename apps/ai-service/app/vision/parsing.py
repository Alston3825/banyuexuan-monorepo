"""合同识别结果的纯函数解析/校验（不依赖网络，便于单元测试）。

模型读手写会有误差，这里的职责是：把它读出来的原文规范化成结构化数据，并用多重校验
（大小写金额互校、身份证校验位、日期合理性、手机号位数……）把"可能读错"的地方筛出来，
交给核对页标黄，最终由销售确认。
"""
import re
from datetime import date
from typing import Dict, List, Optional, Tuple

_DIGITS = {"零": 0, "〇": 0, "壹": 1, "一": 1, "贰": 2, "二": 2, "两": 2, "叁": 3, "三": 3, "肆": 4, "四": 4,
           "伍": 5, "五": 5, "陆": 6, "六": 6, "柒": 7, "七": 7, "捌": 8, "八": 8, "玖": 9, "九": 9}
_UNITS = {"拾": 10, "十": 10, "佰": 100, "百": 100, "仟": 1000, "千": 1000}


def _parse_int_upper(text: str) -> Optional[int]:
    """'贰万玖仟捌佰零拾零' → 29800。遇到无法识别的字符返回 None。"""
    total = 0
    section = 0
    num = 0
    seen_digit = False
    for ch in text:
        if ch in _DIGITS:
            num = _DIGITS[ch]
            seen_digit = True
        elif ch in _UNITS:
            section += (num if seen_digit else 1) * _UNITS[ch]
            num = 0
            seen_digit = False
        elif ch in ("万", "萬"):
            total += (section + num) * 10000
            section = 0
            num = 0
            seen_digit = False
        elif ch in (" ", "　"):
            continue
        else:
            return None
    return total + section + num


def upper_amount_to_yuan(text: Optional[str]) -> Optional[float]:
    """大写金额转元，如 '贰万玖仟捌佰零拾零元零角零分' → 29800.0；无法解析返回 None。"""
    if not text:
        return None
    s = str(text).strip().replace("圆", "元").replace("整", "").replace("正", "").replace("人民币", "")
    yuan_part, sep, frac = s.partition("元")
    if not sep:
        yuan_part, frac = s, ""
    yuan = _parse_int_upper(yuan_part) if yuan_part else 0
    if yuan is None:
        return None
    jiao = fen = 0
    m = re.search(r"([零〇壹贰叁肆伍陆柒捌玖一二两三四五六七八九])角", frac)
    if m:
        jiao = _DIGITS[m.group(1)]
    m = re.search(r"([零〇壹贰叁肆伍陆柒捌玖一二两三四五六七八九])分", frac)
    if m:
        fen = _DIGITS[m.group(1)]
    return yuan + jiao / 10 + fen / 100


def to_number(text) -> Optional[float]:
    """'¥29800.00' / '29800元' / 29800 → 29800.0。"""
    if text is None:
        return None
    if isinstance(text, (int, float)):
        return float(text)
    s = re.sub(r"[,，\s￥¥元]", "", str(text))
    m = re.match(r"^\d+(\.\d+)?$", s)
    return float(s) if m else None


def parse_date(text: Optional[str], min_year: int = 2020, max_year: int = 2040) -> Optional[str]:
    """'2027.1.19' / '2027年1月19日' / '2027-01-19' → '2027-01-19'；不合理返回 None。"""
    if not text:
        return None
    m = re.search(r"(\d{4})\D{1,3}(\d{1,2})\D{1,3}(\d{1,2})", str(text))
    if not m:
        return None
    y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if not (min_year <= y <= max_year):
        return None
    try:
        return date(y, mo, d).isoformat()
    except ValueError:
        return None


def validate_id_card(no: Optional[str]) -> Tuple[Optional[str], Optional[str]]:
    """返回 (规范化后的身份证号, 问题描述)。问题为 None 表示通过。"""
    if not no:
        return None, None
    s = re.sub(r"[\s\-]", "", str(no)).upper()
    if not re.fullmatch(r"\d{17}[\dX]", s):
        return s, "身份证号应为18位，识别到 %d 位" % len(s)
    weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2]
    codes = "10X98765432"
    check = codes[sum(int(c) * w for c, w in zip(s[:17], weights)) % 11]
    if check != s[17]:
        return s, "身份证号校验位不通过，可能有数字识别错误"
    return s, None


def validate_phone(no: Optional[str]) -> Tuple[Optional[str], Optional[str]]:
    if not no:
        return None, None
    s = re.sub(r"[\s\-]", "", str(no))
    if not re.fullmatch(r"1\d{10}", s):
        return s, "手机号应为11位数字，识别到「%s」" % s
    return s, None


def parse_days(text: Optional[str]) -> Tuple[Optional[int], Optional[int]]:
    """'28+28' → (28, 28)；'28' / '28天' → (28, 0)。第一个数=所内入住天数，第二个=出所后到家服务天数。
    无法解析返回 (None, None)。"""
    if not text:
        return None, None
    nums = [int(x) for x in re.findall(r"\d+", str(text))]
    if not nums:
        return None, None
    if len(nums) >= 2 and re.search(r"[+＋加]", str(text)):
        return nums[0], nums[1]
    return nums[0], 0


def parse_care_mode(text: Optional[str]) -> Optional[str]:
    if not text:
        return None
    s = str(text).replace(" ", "")
    # 手写的“一”常被读成短横线、破折号，一并当作“一”
    if re.search(r"[一1]对[一1\-—–－丨]|1:1|1比1|1v1", s, re.I):
        return "ONE_TO_ONE"
    if re.search(r"[一1]对[二2]|1:2|1比2|1v2", s, re.I):
        return "ONE_TO_TWO"
    return None


def parse_orientation(text: Optional[str]) -> Optional[str]:
    """从房型手写原文里提取朝向：南向/北向/南北通透。"""
    if not text:
        return None
    s = str(text)
    has_s, has_n = "南" in s, "北" in s
    if has_s and has_n:
        return "BOTH"
    if has_s:
        return "SOUTH"
    if has_n:
        return "NORTH"
    return None


def most_common_name(cands: List[Tuple[str, int]]) -> Tuple[Optional[str], List[str]]:
    """姓名多处出现（封面、正文、签字页）时做多数表决。cands 是 (名字, 权重)；
    返回 (胜出的名字, 所有不同的写法)。"""
    scores: Dict[str, int] = {}
    for name, weight in cands:
        n = re.sub(r"\s", "", name or "")
        if n:
            scores[n] = scores.get(n, 0) + weight
    if not scores:
        return None, []
    ordered = sorted(scores.items(), key=lambda kv: -kv[1])
    return ordered[0][0], [k for k, _ in ordered]
