-- 宝宝体重统一用“克”：日常记录、宝宝出所评估、生长测量三张表的体重由 kg 改为 g（整数），已有数据按 ×1000 换算
ALTER TABLE `care_daily_baby_records` ADD COLUMN `weight_g` INTEGER NULL;
UPDATE `care_daily_baby_records` SET `weight_g` = ROUND(`weight_kg` * 1000) WHERE `weight_kg` IS NOT NULL;
ALTER TABLE `care_daily_baby_records` DROP COLUMN `weight_kg`;

ALTER TABLE `baby_growth_records` ADD COLUMN `weight_g` INTEGER NULL;
UPDATE `baby_growth_records` SET `weight_g` = ROUND(`weight_kg` * 1000) WHERE `weight_kg` IS NOT NULL;
ALTER TABLE `baby_growth_records` DROP COLUMN `weight_kg`;

ALTER TABLE `care_baby_discharges` ADD COLUMN `admission_weight_g` INTEGER NULL, ADD COLUMN `discharge_weight_g` INTEGER NULL;
UPDATE `care_baby_discharges` SET `admission_weight_g` = ROUND(`admission_weight_kg` * 1000) WHERE `admission_weight_kg` IS NOT NULL;
UPDATE `care_baby_discharges` SET `discharge_weight_g` = ROUND(`discharge_weight_kg` * 1000) WHERE `discharge_weight_kg` IS NOT NULL;
ALTER TABLE `care_baby_discharges` DROP COLUMN `admission_weight_kg`, DROP COLUMN `discharge_weight_kg`;
