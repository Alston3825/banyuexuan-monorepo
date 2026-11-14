-- 护理资料识别范围：BABY_FEEDING = 只识别宝宝单页（体征 + 24小时喂养记录单）
ALTER TABLE `care_documents` ADD COLUMN `extract_scope` VARCHAR(191) NULL;
