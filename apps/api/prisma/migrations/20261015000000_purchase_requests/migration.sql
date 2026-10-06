-- CreateTable
CREATE TABLE `purchase_requests` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NOT NULL,
    `request_no` VARCHAR(191) NOT NULL,
    `request_date` DATE NOT NULL,
    `status` ENUM('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED', 'ORDERED') NOT NULL DEFAULT 'DRAFT',
    `total_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `source_file_name` VARCHAR(191) NULL,
    `remark` TEXT NULL,
    `cancel_reason` TEXT NULL,
    `purchase_order_id` VARCHAR(191) NULL,
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 0,

    INDEX `purchase_requests_tenant_id_store_id_request_date_idx`(`tenant_id`, `store_id`, `request_date`),
    INDEX `purchase_requests_tenant_id_status_idx`(`tenant_id`, `status`),
    UNIQUE INDEX `purchase_requests_tenant_id_request_no_key`(`tenant_id`, `request_no`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `purchase_request_items` (
    `id` VARCHAR(191) NOT NULL,
    `purchase_request_id` VARCHAR(191) NOT NULL,
    `sort_no` INTEGER NOT NULL,
    `item_id` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `spec` VARCHAR(200) NULL,
    `brand` VARCHAR(100) NULL,
    `unit` VARCHAR(191) NULL,
    `quantity` INTEGER NOT NULL,
    `unit_price` DECIMAL(12, 4) NULL,
    `subtotal` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `department` VARCHAR(191) NULL,
    `requester` VARCHAR(191) NULL,
    `purpose` VARCHAR(191) NULL,
    `remark` VARCHAR(191) NULL,

    INDEX `purchase_request_items_purchase_request_id_idx`(`purchase_request_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `purchase_requests` ADD CONSTRAINT `purchase_requests_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_requests` ADD CONSTRAINT `purchase_requests_purchase_order_id_fkey` FOREIGN KEY (`purchase_order_id`) REFERENCES `purchase_orders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_request_items` ADD CONSTRAINT `purchase_request_items_purchase_request_id_fkey` FOREIGN KEY (`purchase_request_id`) REFERENCES `purchase_requests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_request_items` ADD CONSTRAINT `purchase_request_items_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `inventory_items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

