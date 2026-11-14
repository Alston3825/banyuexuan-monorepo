-- CreateTable
CREATE TABLE `customers` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `customer_no` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NOT NULL,
    `source` ENUM('WALK_IN', 'REFERRAL', 'ONLINE_AD', 'SOCIAL_MEDIA', 'PARTNER', 'OTHER') NOT NULL DEFAULT 'WALK_IN',
    `primary_store_id` VARCHAR(191) NULL,
    `assigned_to_id` VARCHAR(191) NULL,
    `remark` TEXT NULL,
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 0,

    INDEX `customers_tenant_id_assigned_to_id_idx`(`tenant_id`, `assigned_to_id`),
    INDEX `customers_tenant_id_primary_store_id_idx`(`tenant_id`, `primary_store_id`),
    INDEX `customers_tenant_id_phone_idx`(`tenant_id`, `phone`),
    UNIQUE INDEX `customers_tenant_id_customer_no_key`(`tenant_id`, `customer_no`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `leads` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `lead_no` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NOT NULL,
    `source` ENUM('WALK_IN', 'REFERRAL', 'ONLINE_AD', 'SOCIAL_MEDIA', 'PARTNER', 'OTHER') NOT NULL DEFAULT 'WALK_IN',
    `store_id` VARCHAR(191) NULL,
    `status` ENUM('NEW', 'ASSIGNED', 'FOLLOWING', 'CONVERTED', 'LOST') NOT NULL DEFAULT 'NEW',
    `assigned_to_id` VARCHAR(191) NULL,
    `customer_id` VARCHAR(191) NULL,
    `lost_reason` TEXT NULL,
    `remark` TEXT NULL,
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 0,

    INDEX `leads_tenant_id_status_idx`(`tenant_id`, `status`),
    INDEX `leads_tenant_id_assigned_to_id_idx`(`tenant_id`, `assigned_to_id`),
    INDEX `leads_tenant_id_store_id_idx`(`tenant_id`, `store_id`),
    UNIQUE INDEX `leads_tenant_id_lead_no_key`(`tenant_id`, `lead_no`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sales_opportunities` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `opportunity_no` VARCHAR(191) NOT NULL,
    `customer_id` VARCHAR(191) NOT NULL,
    `lead_id` VARCHAR(191) NULL,
    `stage` ENUM('FOLLOWING', 'QUOTED', 'WON', 'LOST') NOT NULL DEFAULT 'FOLLOWING',
    `amount` INTEGER NULL,
    `assigned_to_id` VARCHAR(191) NULL,
    `lost_reason` TEXT NULL,
    `remark` TEXT NULL,
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 0,

    INDEX `sales_opportunities_tenant_id_stage_idx`(`tenant_id`, `stage`),
    INDEX `sales_opportunities_tenant_id_customer_id_idx`(`tenant_id`, `customer_id`),
    INDEX `sales_opportunities_tenant_id_assigned_to_id_idx`(`tenant_id`, `assigned_to_id`),
    UNIQUE INDEX `sales_opportunities_tenant_id_opportunity_no_key`(`tenant_id`, `opportunity_no`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `follow_up_records` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `business_type` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `type` ENUM('PHONE_CALL', 'WECHAT', 'SMS', 'ON_SITE_VISIT', 'INVITATION', 'OTHER') NOT NULL,
    `content` TEXT NOT NULL,
    `next_follow_up_at` DATETIME(3) NULL,
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `follow_up_records_tenant_id_business_type_business_id_idx`(`tenant_id`, `business_type`, `business_id`),
    INDEX `follow_up_records_tenant_id_created_at_idx`(`tenant_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `customers` ADD CONSTRAINT `customers_primary_store_id_fkey` FOREIGN KEY (`primary_store_id`) REFERENCES `stores`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customers` ADD CONSTRAINT `customers_assigned_to_id_fkey` FOREIGN KEY (`assigned_to_id`) REFERENCES `accounts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leads` ADD CONSTRAINT `leads_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leads` ADD CONSTRAINT `leads_assigned_to_id_fkey` FOREIGN KEY (`assigned_to_id`) REFERENCES `accounts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leads` ADD CONSTRAINT `leads_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sales_opportunities` ADD CONSTRAINT `sales_opportunities_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sales_opportunities` ADD CONSTRAINT `sales_opportunities_lead_id_fkey` FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sales_opportunities` ADD CONSTRAINT `sales_opportunities_assigned_to_id_fkey` FOREIGN KEY (`assigned_to_id`) REFERENCES `accounts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
