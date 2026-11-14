-- AlterTable
ALTER TABLE `customers` ADD COLUMN `birthday` DATE NULL,
    ADD COLUMN `cc_account_ids` JSON NULL,
    ADD COLUMN `channel_id` VARCHAR(191) NULL,
    ADD COLUMN `his_no` VARCHAR(191) NULL,
    ADD COLUMN `passport_no` VARCHAR(191) NULL,
    ADD COLUMN `phone_sales_id` VARCHAR(191) NULL,
    ADD COLUMN `referrer_id` VARCHAR(191) NULL,
    ADD COLUMN `referrer_type` ENUM('CUSTOMER', 'ACCOUNT') NULL,
    ADD COLUMN `registered_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `zone` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `customer_channels` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `source_type` ENUM('WALK_IN', 'REFERRAL', 'ONLINE_AD', 'SOCIAL_MEDIA', 'PARTNER', 'OTHER') NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `customer_channels_tenant_id_source_type_name_key`(`tenant_id`, `source_type`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `customers_tenant_id_channel_id_idx` ON `customers`(`tenant_id`, `channel_id`);

-- CreateIndex
CREATE INDEX `customers_tenant_id_phone_sales_id_idx` ON `customers`(`tenant_id`, `phone_sales_id`);

-- AddForeignKey
ALTER TABLE `customers` ADD CONSTRAINT `customers_phone_sales_id_fkey` FOREIGN KEY (`phone_sales_id`) REFERENCES `accounts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customers` ADD CONSTRAINT `customers_channel_id_fkey` FOREIGN KEY (`channel_id`) REFERENCES `customer_channels`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- 已有客户的"添加时间"回填为原来的建档时间（否则会全部变成迁移当天）
UPDATE `customers` SET `registered_at` = `created_at`;
