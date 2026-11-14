-- CreateTable
CREATE TABLE `care_daily_records` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NOT NULL,
    `mother_profile_id` VARCHAR(191) NOT NULL,
    `record_date` DATE NOT NULL,
    `stay_day` INTEGER NULL,
    `document_id` VARCHAR(191) NULL,
    `mother_temperature` DOUBLE NULL,
    `mother_pulse` INTEGER NULL,
    `mother_bp_systolic` INTEGER NULL,
    `mother_bp_diastolic` INTEGER NULL,
    `breast` JSON NULL,
    `breast_body` JSON NULL,
    `milk` VARCHAR(191) NULL,
    `wound_cesarean` JSON NULL,
    `wound_vaginal` JSON NULL,
    `lochia_status` VARCHAR(191) NULL,
    `lochia_color` VARCHAR(191) NULL,
    `lochia_amount` VARCHAR(191) NULL,
    `lochia_odor` VARCHAR(191) NULL,
    `bowel` VARCHAR(191) NULL,
    `urine` VARCHAR(191) NULL,
    `mother_plan` TEXT NULL,
    `mother_nurse_name` VARCHAR(191) NULL,
    `mother_client_signer` VARCHAR(191) NULL,
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 0,

    INDEX `care_daily_records_tenant_id_store_id_record_date_idx`(`tenant_id`, `store_id`, `record_date`),
    UNIQUE INDEX `care_daily_records_mother_profile_id_record_date_key`(`mother_profile_id`, `record_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `care_daily_baby_records` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NOT NULL,
    `daily_record_id` VARCHAR(191) NOT NULL,
    `baby_profile_id` VARCHAR(191) NOT NULL,
    `document_id` VARCHAR(191) NULL,
    `age_days` INTEGER NULL,
    `weight_kg` DOUBLE NULL,
    `temp_morning` DOUBLE NULL,
    `temp_evening` DOUBLE NULL,
    `eye` JSON NULL,
    `mouth` JSON NULL,
    `nose` JSON NULL,
    `umbilical` JSON NULL,
    `genitalia` JSON NULL,
    `skin` JSON NULL,
    `health_assessment` VARCHAR(191) NULL,
    `jaundice_forehead` DOUBLE NULL,
    `jaundice_canthus` DOUBLE NULL,
    `jaundice_chest` DOUBLE NULL,
    `baby_plan` TEXT NULL,
    `day_shift_summary` TEXT NULL,
    `night_shift_summary` TEXT NULL,
    `day_nurse_name` VARCHAR(191) NULL,
    `night_nurse_name` VARCHAR(191) NULL,
    `baby_client_signer` VARCHAR(191) NULL,
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 0,

    INDEX `care_daily_baby_records_baby_profile_id_idx`(`baby_profile_id`),
    UNIQUE INDEX `care_daily_baby_records_daily_record_id_baby_profile_id_key`(`daily_record_id`, `baby_profile_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `care_feeding_entries` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `baby_daily_id` VARCHAR(191) NOT NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `time` VARCHAR(191) NULL,
    `direct_feed_min` INTEGER NULL,
    `breast_milk_ml` INTEGER NULL,
    `formula_ml` INTEGER NULL,
    `medication` VARCHAR(191) NULL,
    `water_ml` INTEGER NULL,
    `urine` VARCHAR(191) NULL,
    `stool` VARCHAR(191) NULL,
    `stool_color` VARCHAR(191) NULL,
    `stool_amount` VARCHAR(191) NULL,
    `stool_texture` VARCHAR(191) NULL,
    `nurse_name` VARCHAR(191) NULL,
    `remark` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `care_feeding_entries_baby_daily_id_idx`(`baby_daily_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `care_daily_records` ADD CONSTRAINT `care_daily_records_mother_profile_id_fkey` FOREIGN KEY (`mother_profile_id`) REFERENCES `mother_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `care_daily_records` ADD CONSTRAINT `care_daily_records_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `care_documents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `care_daily_baby_records` ADD CONSTRAINT `care_daily_baby_records_daily_record_id_fkey` FOREIGN KEY (`daily_record_id`) REFERENCES `care_daily_records`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `care_daily_baby_records` ADD CONSTRAINT `care_daily_baby_records_baby_profile_id_fkey` FOREIGN KEY (`baby_profile_id`) REFERENCES `baby_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `care_daily_baby_records` ADD CONSTRAINT `care_daily_baby_records_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `care_documents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `care_feeding_entries` ADD CONSTRAINT `care_feeding_entries_baby_daily_id_fkey` FOREIGN KEY (`baby_daily_id`) REFERENCES `care_daily_baby_records`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

