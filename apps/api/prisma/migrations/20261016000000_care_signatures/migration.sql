-- AlterTable
ALTER TABLE `accounts` ADD COLUMN `signature_data` MEDIUMTEXT NULL,
    ADD COLUMN `signature_updated_at` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `care_daily_signatures` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NOT NULL,
    `daily_record_id` VARCHAR(191) NOT NULL,
    `shift` ENUM('DAY', 'NIGHT', 'RELIEF') NOT NULL,
    `nurse_account_id` VARCHAR(191) NOT NULL,
    `nurse_name` VARCHAR(191) NOT NULL,
    `signature_data` MEDIUMTEXT NULL,
    `content_hash` VARCHAR(64) NOT NULL,
    `signed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `ip` VARCHAR(191) NULL,
    `device_id` VARCHAR(64) NULL,

    INDEX `care_daily_signatures_tenant_id_nurse_account_id_idx`(`tenant_id`, `nurse_account_id`),
    UNIQUE INDEX `care_daily_signatures_daily_record_id_nurse_account_id_key`(`daily_record_id`, `nurse_account_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `care_confirm_links` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NOT NULL,
    `mother_profile_id` VARCHAR(191) NOT NULL,
    `token_hash` VARCHAR(64) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `revoked_at` DATETIME(3) NULL,
    `failed_attempts` INTEGER NOT NULL DEFAULT 0,
    `locked_until` DATETIME(3) NULL,
    `open_count` INTEGER NOT NULL DEFAULT 0,
    `last_opened_at` DATETIME(3) NULL,

    UNIQUE INDEX `care_confirm_links_token_hash_key`(`token_hash`),
    INDEX `care_confirm_links_tenant_id_mother_profile_id_idx`(`tenant_id`, `mother_profile_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `care_daily_confirmations` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NOT NULL,
    `daily_record_id` VARCHAR(191) NOT NULL,
    `link_id` VARCHAR(191) NOT NULL,
    `batch_id` VARCHAR(40) NOT NULL,
    `method` ENUM('SIGNATURE', 'BUTTON') NOT NULL,
    `signature_data` MEDIUMTEXT NULL,
    `satisfaction` INTEGER NOT NULL,
    `comment` VARCHAR(500) NULL,
    `content_hash` VARCHAR(64) NOT NULL,
    `confirmed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `ip` VARCHAR(191) NULL,
    `user_agent` VARCHAR(300) NULL,
    `device_id` VARCHAR(64) NULL,
    `dwell_ms` INTEGER NOT NULL,
    `hold_ms` INTEGER NULL,
    `risk_flags` JSON NULL,

    INDEX `care_daily_confirmations_daily_record_id_confirmed_at_idx`(`daily_record_id`, `confirmed_at`),
    INDEX `care_daily_confirmations_device_id_idx`(`device_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `staff_devices` (
    `id` VARCHAR(191) NOT NULL,
    `account_id` VARCHAR(191) NOT NULL,
    `device_id` VARCHAR(64) NOT NULL,
    `first_seen_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `last_seen_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `last_ip` VARCHAR(191) NULL,

    INDEX `staff_devices_device_id_idx`(`device_id`),
    UNIQUE INDEX `staff_devices_account_id_device_id_key`(`account_id`, `device_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `care_daily_signatures` ADD CONSTRAINT `care_daily_signatures_daily_record_id_fkey` FOREIGN KEY (`daily_record_id`) REFERENCES `care_daily_records`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `care_daily_signatures` ADD CONSTRAINT `care_daily_signatures_nurse_account_id_fkey` FOREIGN KEY (`nurse_account_id`) REFERENCES `accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `care_confirm_links` ADD CONSTRAINT `care_confirm_links_mother_profile_id_fkey` FOREIGN KEY (`mother_profile_id`) REFERENCES `mother_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `care_daily_confirmations` ADD CONSTRAINT `care_daily_confirmations_daily_record_id_fkey` FOREIGN KEY (`daily_record_id`) REFERENCES `care_daily_records`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `care_daily_confirmations` ADD CONSTRAINT `care_daily_confirmations_link_id_fkey` FOREIGN KEY (`link_id`) REFERENCES `care_confirm_links`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `staff_devices` ADD CONSTRAINT `staff_devices_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

