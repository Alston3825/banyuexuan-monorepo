-- 站内消息（消息中心）
CREATE TABLE `notifications` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `account_id` VARCHAR(191) NOT NULL,
    `category` VARCHAR(32) NOT NULL,
    `level` VARCHAR(16) NOT NULL DEFAULT 'info',
    `title` VARCHAR(200) NOT NULL,
    `body` VARCHAR(1000) NULL,
    `link` VARCHAR(300) NULL,
    `dedup_key` VARCHAR(191) NULL,
    `read_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `notifications_account_id_dedup_key_key`(`account_id`, `dedup_key`),
    INDEX `notifications_account_id_read_at_created_at_idx`(`account_id`, `read_at`, `created_at`),
    INDEX `notifications_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
