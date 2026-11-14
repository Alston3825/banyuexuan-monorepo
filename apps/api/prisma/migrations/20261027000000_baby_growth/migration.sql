-- 宝宝生长测量记录 + 发给客户的生长曲线链接
CREATE TABLE `baby_growth_records` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NOT NULL,
    `mother_profile_id` VARCHAR(191) NOT NULL,
    `baby_profile_id` VARCHAR(191) NOT NULL,
    `measured_at` DATE NOT NULL,
    `weight_kg` DOUBLE NULL,
    `length_cm` DOUBLE NULL,
    `head_cm` DOUBLE NULL,
    `measured_by_name` VARCHAR(191) NULL,
    `note` VARCHAR(191) NULL,
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `baby_growth_records_tenant_id_baby_profile_id_measured_at_idx`(`tenant_id`, `baby_profile_id`, `measured_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `baby_growth_shares` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `baby_profile_id` VARCHAR(191) NOT NULL,
    `token_hash` VARCHAR(64) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `revoked_at` DATETIME(3) NULL,
    `open_count` INTEGER NOT NULL DEFAULT 0,
    `last_opened_at` DATETIME(3) NULL,

    UNIQUE INDEX `baby_growth_shares_token_hash_key`(`token_hash`),
    INDEX `baby_growth_shares_tenant_id_baby_profile_id_idx`(`tenant_id`, `baby_profile_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `baby_growth_records` ADD CONSTRAINT `baby_growth_records_baby_profile_id_fkey` FOREIGN KEY (`baby_profile_id`) REFERENCES `baby_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `baby_growth_shares` ADD CONSTRAINT `baby_growth_shares_baby_profile_id_fkey` FOREIGN KEY (`baby_profile_id`) REFERENCES `baby_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
