CREATE TABLE `satisfaction_surveys` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NULL,
    `form_no` INTEGER NOT NULL,
    `customer_id` VARCHAR(191) NULL,
    `customer_name` VARCHAR(191) NULL,
    `room_no` VARCHAR(191) NULL,
    `steward_name` VARCHAR(191) NULL,
    `nurse_name` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `survey_date` DATE NULL,
    `scores` JSON NULL,
    `suggestion` TEXT NULL,
    `praise` TEXT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'DRAFT',
    `extract_status` ENUM('NONE', 'PENDING', 'RUNNING', 'DONE', 'FAILED') NOT NULL DEFAULT 'NONE',
    `extract_error` TEXT NULL,
    `extract_warnings` JSON NULL,
    `extract_model` VARCHAR(191) NULL,
    `extracted_at` DATETIME(3) NULL,
    `confirmed_by` VARCHAR(191) NULL,
    `confirmed_at` DATETIME(3) NULL,
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 0,

    INDEX `satisfaction_surveys_tenant_id_form_no_status_idx`(`tenant_id`, `form_no`, `status`),
    INDEX `satisfaction_surveys_tenant_id_customer_id_idx`(`tenant_id`, `customer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `satisfaction_survey_files` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `survey_id` VARCHAR(191) NOT NULL,
    `file_name` VARCHAR(191) NOT NULL,
    `storage_path` VARCHAR(191) NOT NULL,
    `original_path` VARCHAR(191) NULL,
    `mime_type` VARCHAR(191) NOT NULL,
    `size_bytes` INTEGER NOT NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `satisfaction_survey_files_survey_id_idx`(`survey_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `satisfaction_survey_files` ADD CONSTRAINT `satisfaction_survey_files_survey_id_fkey` FOREIGN KEY (`survey_id`) REFERENCES `satisfaction_surveys`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
