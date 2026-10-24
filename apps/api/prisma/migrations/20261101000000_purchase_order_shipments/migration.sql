CREATE TABLE `purchase_order_shipments` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `purchase_order_id` VARCHAR(191) NOT NULL,
    `platform` VARCHAR(20) NOT NULL DEFAULT '1688',
    `platform_order_no` VARCHAR(64) NOT NULL,
    `seller_name` VARCHAR(120) NULL,
    `goods_title` VARCHAR(500) NULL,
    `amount` INTEGER NOT NULL DEFAULT 0,
    `order_status` VARCHAR(40) NULL,
    `express_company` VARCHAR(40) NULL,
    `express_no` VARCHAR(100) NOT NULL DEFAULT '',
    `logistics_state` INTEGER NULL,
    `logistics_trace` JSON NULL,
    `logistics_checked_at` DATETIME(3) NULL,
    `logistics_error` VARCHAR(255) NULL,
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `purchase_order_shipments_tenant_id_platform_order_no_idx`(`tenant_id`, `platform_order_no`),
    UNIQUE INDEX `purchase_order_shipments_purchase_order_id_platform_order_no_key`(`purchase_order_id`, `platform_order_no`, `express_no`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `purchase_order_shipments` ADD CONSTRAINT `purchase_order_shipments_purchase_order_id_fkey` FOREIGN KEY (`purchase_order_id`) REFERENCES `purchase_orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
