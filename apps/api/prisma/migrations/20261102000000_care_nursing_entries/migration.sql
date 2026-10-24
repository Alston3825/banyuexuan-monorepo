ALTER TABLE `care_feeding_entries` ADD COLUMN `medication_dose` VARCHAR(191) NULL;

CREATE TABLE `care_nursing_entries` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `baby_daily_id` VARCHAR(191) NOT NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `time` VARCHAR(191) NULL,
    `morning_care` VARCHAR(191) NULL,
    `cord_care` VARCHAR(191) NULL,
    `skin_care` VARCHAR(191) NULL,
    `jaundice_patch` VARCHAR(191) NULL,
    `nurse_name` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `care_nursing_entries_baby_daily_id_idx`(`baby_daily_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `care_nursing_entries` ADD CONSTRAINT `care_nursing_entries_baby_daily_id_fkey` FOREIGN KEY (`baby_daily_id`) REFERENCES `care_daily_baby_records`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
