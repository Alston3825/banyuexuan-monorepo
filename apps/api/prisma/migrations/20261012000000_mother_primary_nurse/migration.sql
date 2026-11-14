-- 母婴档案增加“主责护理师”（员工账号）。只加列，不改动已有数据。
ALTER TABLE `mother_profiles` ADD COLUMN `primary_nurse_id` VARCHAR(191) NULL;

CREATE INDEX `mother_profiles_primary_nurse_id_idx` ON `mother_profiles`(`primary_nurse_id`);

ALTER TABLE `mother_profiles` ADD CONSTRAINT `mother_profiles_primary_nurse_id_fkey` FOREIGN KEY (`primary_nurse_id`) REFERENCES `accounts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
