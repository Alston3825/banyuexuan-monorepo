-- 日常记录恶露颜色选项改为 鲜红/粉红/暗红/褐色：旧的“浅褐色”“白色淡黄色”并入“褐色”（旧的“鲜艳/暗红”仍是鲜红）
UPDATE `care_daily_records` SET `lochia_color` = 'BROWN' WHERE `lochia_color` IN ('LIGHT_BROWN', 'WHITE_YELLOW');
