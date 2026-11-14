from app.vision.care_form_extractor import build_prompt, merge_reads
from datetime import date

COLUMNS = [
    {"key": "time", "label": "时间", "kind": "text"},
    {"key": "formulaMl", "label": "奶粉(ml)", "kind": "int", "min": 0, "max": 300},
    {"key": "urine", "label": "小便", "kind": "single", "options": [{"value": "YES", "label": "有"}]},
]
FIELDS = [{"key": "feedings", "label": "喂养记录单", "kind": "table", "columns": COLUMNS}]


def test_prompt_describes_table_columns():
    p = build_prompt("日常记录", "说明", FIELDS, date(2026, 10, 5))
    assert "feedings（喂养记录单）" in p and "formulaMl（奶粉(ml)）" in p and "JSON 数组" in p


def test_table_rows_agree_and_times_are_normalized():
    r1 = {"feedings": [{"time": "2:00", "formulaMl": 60, "urine": "YES"}, {"time": "7:10", "formulaMl": "60"}]}
    r2 = {"feedings": [{"time": "02:00", "formulaMl": 60, "urine": "YES"}, {"time": "07:10", "formulaMl": 60}]}
    data, warnings = merge_reads(FIELDS, [r1, r2])
    assert data["feedings"] == [{"time": "02:00", "formulaMl": 60, "urine": "YES"}, {"time": "07:10", "formulaMl": 60}]
    assert warnings == []


def test_table_cell_and_row_count_disagreement():
    r1 = {"feedings": [{"time": "02:00", "formulaMl": 60}, {"time": "07:10", "formulaMl": 80}]}
    r2 = {"feedings": [{"time": "02:00", "formulaMl": 60}, {"time": "07:10", "formulaMl": 60}]}
    _, warnings = merge_reads(FIELDS, [r1, r2])
    fields = {w["field"] for w in warnings}
    assert "feedings.1.formulaMl" in fields and "feedings" in fields

    r3 = {"feedings": [{"time": "02:00", "formulaMl": 60}]}
    _, warnings = merge_reads(FIELDS, [r3, r2])
    assert any(w["field"] == "feedings" and "行数不一致" in w["message"] for w in warnings)


def test_table_out_of_range_cell_warns_and_blank_rows_dropped():
    r = {"feedings": [{"time": "02:00", "formulaMl": 600}, {"time": None, "formulaMl": None}]}
    data, warnings = merge_reads(FIELDS, [r, r])
    assert len(data["feedings"]) == 1
    assert any(w["field"] == "feedings.0.formulaMl" for w in warnings)


def test_empty_number_cell_and_zero_are_the_same():
    # 整列空着的数字格：一次读成 0、一次读成空，不该标黄
    r1 = {"feedings": [{"time": "02:00", "formulaMl": 0}]}
    r2 = {"feedings": [{"time": "02:00", "formulaMl": None}]}
    _, warnings = merge_reads(FIELDS, [r1, r2])
    assert warnings == []
