from app.vision import parsing
from app.vision.contract_extractor import aggregate


def test_upper_amount_to_yuan():
    assert parsing.upper_amount_to_yuan("贰万玖仟捌佰零拾零元零角零分") == 29800.0
    assert parsing.upper_amount_to_yuan("捌仟玖佰肆拾元整") == 8940.0
    assert parsing.upper_amount_to_yuan("壹万伍仟玖佰肆拾零元零角零分") == 15940.0
    assert parsing.upper_amount_to_yuan("拾万元整") == 100000.0
    assert parsing.upper_amount_to_yuan("柒仟陆佰元伍角") == 7600.5
    assert parsing.upper_amount_to_yuan("乱七八糟") is None


def test_to_number_and_date():
    assert parsing.to_number("¥29800.00") == 29800.0
    assert parsing.to_number("19800元") == 19800.0
    assert parsing.to_number("abc") is None
    assert parsing.parse_date("2027.1.19") == "2027-01-19"
    assert parsing.parse_date("2027年3月21日") == "2027-03-21"
    assert parsing.parse_date("2027-02-30") is None
    assert parsing.parse_date("1999.1.1") is None


def test_id_card_and_phone_validation():
    no, issue = parsing.validate_id_card("11010519491231002X")
    assert no == "11010519491231002X" and issue is None
    _, issue = parsing.validate_id_card("110105194912310021")
    assert "校验位" in issue
    _, issue = parsing.validate_id_card("1101051949")
    assert "18位" in issue
    assert parsing.validate_phone("18066756759") == ("18066756759", None)
    assert parsing.validate_phone("1806675675")[1] is not None


def test_days_care_mode_orientation():
    assert parsing.parse_days("28+28") == (28, 28)
    assert parsing.parse_days("28+28天") == (28, 28)
    assert parsing.parse_days("40") == (40, 0)
    assert parsing.parse_days("") == (None, None)
    assert parsing.parse_care_mode("一对一") == "ONE_TO_ONE"
    assert parsing.parse_care_mode("1对2") == "ONE_TO_TWO"
    assert parsing.parse_care_mode("一对-") == "ONE_TO_ONE"  # 手写的“一”常被读成短横线
    assert parsing.parse_care_mode("其他") is None
    assert parsing.parse_orientation("至臻(2间房-南-北)") == "BOTH"
    assert parsing.parse_orientation("南向") == "SOUTH"
    assert parsing.parse_orientation("至爱") is None


def _page(n, kind, **fields):
    base = {"_page": n, "page_kind": kind, "gift_items": [], "extra_handwriting": [], "unclear_fields": []}
    base.update(fields)
    return base


def _good_pages():
    return [
        _page(1, "cover", mother_name="张三", contract_no="2026 09 149", due_date_text="2027.3.21", signed_date_text="2026.9.19"),
        _page(
            2, "body_1", mother_name="张三", due_date_text="2027-3-21", id_card_no="11010519491231002X", phone="18066756759",
            hospital="西电医院", address="西安市某路", emergency_name="李四", emergency_relation="夫妻", emergency_phone="13201879630",
            fetus="single", room_type_text="至臻(南)", care_mode_text="一对一", days_text="28+28",
        ),
        _page(3, "body_2", package_upper="壹万玖仟捌佰元整", package_lower="19800", deposit_upper="伍仟玖佰肆拾元整", deposit_lower="5940"),
        _page(7, "body_sign", signature_name="张三", sign_date_text="2026.9.19"),
    ]


def test_aggregate_clean_contract_has_no_warnings():
    data, warnings = aggregate(_good_pages(), {"room_type_text": "至臻(南)", "care_mode_text": "一对一", "days_text": "28+28", "legible": True})
    assert data["contract_no"] == "2026-09-149"
    assert data["signed_date"] == "2026-09-19" and data["due_date"] == "2027-03-21"
    assert data["package_amount"] == 19800.0 and data["deposit_amount"] == 5940.0
    assert data["in_house_days"] == 28 and data["home_service_days"] == 28
    assert data["care_mode"] == "ONE_TO_ONE" and data["orientation"] == "SOUTH"
    assert data["gift_items"] == []
    assert [w for w in warnings if w["level"] != "info"] == []


def test_aggregate_flags_problems():
    pages = _good_pages()
    pages[0]["mother_name"] = "张山"  # 封面与正文姓名不一致
    pages[2]["package_lower"] = "19000"  # 大小写金额不一致
    pages[1]["id_card_no"] = "110105194912310021"  # 校验位错
    pages[3]["extra_handwriting"] = [{"where": "签字页下方", "text": "赠送宝宝游泳2次", "legible": True}]
    pages[1]["gift_items"] = [{"name": "盆底修复", "quantity": "3次", "legible": True}, {"name": "宝宝[?]", "quantity": None, "legible": False}]
    data, warnings = aggregate(pages, {"room_type_text": "至爱", "care_mode_text": "一对二", "days_text": "28", "legible": False})
    fields = {(w["field"], w["level"]) for w in warnings}
    assert ("mother_name", "warn") in fields
    assert ("package_amount", "warn") in fields
    assert ("id_card_no", "warn") in fields
    assert ("gift_items", "warn") in fields
    assert ("room_type_text", "warn") in fields  # 潦草 + 两次识别不一致
    assert len(data["gift_items"]) == 2 and data["gift_items"][1]["needs_review"] is True
    assert ("days_text", "warn") in fields  # 整页读到 28+28，再读只读到 28：不一致要提醒
    data2, _ = aggregate(_good_pages(), {"room_type_text": "至臻(南)", "care_mode_text": "一对一", "days_text": "40", "legible": True})
    assert data2["in_house_days"] == 28  # 整页 28+28 排在前面，并列时取先出现的（同时会提醒核对）
    solo = _good_pages()
    solo[1]["days_text"] = "28"
    data3, _ = aggregate(solo, None)
    assert data3["in_house_days"] == 28 and data3["home_service_days"] == 0  # 只写 28：没有到家服务


def test_amount_vote_strong_majority_is_quiet_but_tie_is_flagged():
    pages = _good_pages()
    pages[2]["deposit_upper"] = "肆万捌仟玖佰肆拾元整"  # 把 ⊗ 万 误读成 肆万 → 48940
    pages[2]["deposit_lower"] = "8940"
    # 三次高清再读都是 8940：7 票对 1 票，采用 8940，占比够高就不再打扰销售
    reread = {"deposit_upper": "捌仟玖佰肆拾元整", "deposit_lower": "8940"}
    data, warnings = aggregate(pages, None, [reread, reread, reread])
    assert data["deposit_amount"] == 8940.0
    assert not any(w["field"] == "deposit_amount" for w in warnings)
    # 只再读一次：3 票对 1 票（75%）刚好够；两两各半就必须提醒
    tie_pages = _good_pages()
    tie_pages[2]["deposit_upper"] = "柒仟元整"
    tie_pages[2]["deposit_lower"] = "8940"
    data2, warnings2 = aggregate(tie_pages, None, None)
    assert any(w["field"] == "deposit_amount" and w["level"] == "warn" for w in warnings2)


def test_signature_and_date_on_sign_page_are_not_gifts():
    pages = _good_pages()
    pages[3]["extra_handwriting"] = [
        {"where": "乙方或授权代表（签字）处", "text": "陈韦", "legible": True},
        {"where": "乙方签字日期处", "text": "2026年9月19日", "legible": True},
    ]
    _, warnings = aggregate(pages, None)
    assert not any(w["field"] == "gift_items" for w in warnings)


def test_aggregate_missing_fields():
    data, warnings = aggregate([_page(1, "cover")], None)
    missing = {w["field"] for w in warnings if w["level"] == "missing"}
    assert {"mother_name", "contract_no", "signed_date", "due_date", "package_amount", "deposit_amount"} <= missing
