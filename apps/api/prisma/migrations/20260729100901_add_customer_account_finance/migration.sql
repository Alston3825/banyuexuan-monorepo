-- CreateTable
CREATE TABLE `customer_accounts` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `customer_id` VARCHAR(191) NOT NULL,
    `principal_balance` INTEGER NOT NULL DEFAULT 0,
    `gift_balance` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `customer_accounts_customer_id_key`(`customer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `customer_account_transactions` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `account_id` VARCHAR(191) NOT NULL,
    `type` ENUM('RECHARGE', 'CONSUME', 'REFUND', 'ADJUST') NOT NULL,
    `principal_delta` INTEGER NOT NULL DEFAULT 0,
    `gift_delta` INTEGER NOT NULL DEFAULT 0,
    `principal_after` INTEGER NOT NULL,
    `gift_after` INTEGER NOT NULL,
    `source_type` VARCHAR(191) NULL,
    `source_id` VARCHAR(191) NULL,
    `remark` TEXT NULL,
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `customer_account_transactions_tenant_id_account_id_idx`(`tenant_id`, `account_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `customer_accounts` ADD CONSTRAINT `customer_accounts_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customer_account_transactions` ADD CONSTRAINT `customer_account_transactions_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `customer_accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
