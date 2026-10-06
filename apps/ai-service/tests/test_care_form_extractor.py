from datetime import date

from app.vision.care_form_extractor import build_prompt, merge_reads

FIELDS = [
    {"key": "temperature", "label": "体温", "kind": "decimal", "unit": "℃", "min": 35, "max": 40},
    {"key": "pulse", "label": "脉搏", "kind": "int", "min": 40, "max": 180},
    {"key": "deliveryMethod", "label": "分娩方式", "kind": "single", "options": [{"value": "VAGINAL", "label": "顺产"}, {"value": "CESAREAN", "label": "剖腹产"}]},
    {"key": "skin", "label": "皮肤", "kind": "multi", "options": [{"value": "DRY", "label": "干燥"}, {"value": "RASH", "label": "红疹"}]},
    {"key": "admissionDate", "label": "入所日期", "kind": "date"},
    {"key": "handlingNotes", "label": "处理", "kind": "longtext"},
]


def by_field(warnings):
    return {w["field"]: w for w in warnings}


def test_prompt_contains_keys_options_and_year_rule():
    p = build_prompt("产妇入住评估单", "说明", FIELDS, date(2026, 10, 5))
    assert "temperature（体温）" in p and "CESAREAN=剖腹产" in p and "2026" in p and "unclear_fields" in p


def test_agreeing_reads_have_no_warning():
    reads = [{"temperature": 36.3, "pulse": 76, "deliveryMethod": "CESAREAN"}, {"temperature": "36.3", "pulse": "76", "deliveryMethod": "CESAREAN"}]
    data, warnings = merge_reads(FIELDS, reads)
    assert data == {"temperature": 36.3, "pulse": 76, "deliveryMethod": "CESAREAN"}
    assert warnings == []


def test_disagreeing_numbers_warn_and_take_hires_read():
    data, warnings = merge_reads(FIELDS, [{"pulse": 76}, {"pulse": 78}])
    assert data["pulse"] == 78
    assert "不一致" in by_field(warnings)["pulse"]["message"]


def test_out_of_range_and_unknown_option_warn():
    data, warnings = merge_reads(FIELDS, [{"temperature": 363, "deliveryMethod": "剖宫产"}, {"temperature": 363, "deliveryMethod": "剖宫产"}])
    w = by_field(warnings)
    assert "超出常见范围" in w["temperature"]["message"]
    assert "不在可选项" in w["deliveryMethod"]["message"]
    assert "deliveryMethod" not in data


def test_multi_dates_and_unclear_fields():
    reads = [
        {"skin": ["DRY", "bogus"], "admissionDate": "2026-08-24", "handlingNotes": "1. 子宫\n2. 伤口", "unclear_fields": ["handlingNotes", "pulse"]},
        {"skin": ["DRY"], "admissionDate": "24/8", "handlingNotes": "1. 子宫\n2. 伤口", "unclear_fields": []},
    ]
    data, warnings = merge_reads(FIELDS, reads)
    assert data["skin"] == ["DRY"]
    assert data["admissionDate"] == "2026-08-24"  # 第二次的日期格式不合法，被丢弃，沿用第一次
    w = by_field(warnings)
    assert "字迹不清晰" in w["handlingNotes"]["message"]
    assert "pulse" in w and "没有识别出来" in w["pulse"]["message"]
