-- 客户 / 母婴档案“归档”：用过的资料不能删，只能归档（列表默认隐藏，可恢复）
ALTER TABLE `customers` ADD COLUMN `archive_reason` VARCHAR(191) NULL,
    ADD COLUMN `archived_at` DATETIME(3) NULL,
    ADD COLUMN `archived_by` VARCHAR(191) NULL;

ALTER TABLE `mother_profiles` ADD COLUMN `archived_at` DATETIME(3) NULL,
    ADD COLUMN `archived_by` VARCHAR(191) NULL;
