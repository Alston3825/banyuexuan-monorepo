-- AlterTable
ALTER TABLE `goods_receipt_items` ADD COLUMN `received_quantity` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `goods_receipts` ADD COLUMN `short_closed_note` TEXT NULL,
    ADD COLUMN `tracked` BOOLEAN NOT NULL DEFAULT false,
    MODIFY `status` ENUM('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED', 'PURCHASED', 'PENDING_RECEIPT', 'PARTIALLY_RECEIVED') NOT NULL DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE `purchase_orders` ADD COLUMN `express_no` VARCHAR(191) NULL,
    ADD COLUMN `purchase_note` TEXT NULL,
    ADD COLUMN `purchased_at` DATETIME(3) NULL,
    ADD COLUMN `purchased_by_id` VARCHAR(191) NULL,
    MODIFY `status` ENUM('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED', 'PURCHASED', 'PENDING_RECEIPT', 'PARTIALLY_RECEIVED') NOT NULL DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE `purchase_requests` ADD COLUMN `department_name` VARCHAR(191) NULL,
    ADD COLUMN `kind` ENUM('SUMMARY', 'DEPARTMENT') NOT NULL DEFAULT 'SUMMARY',
    ADD COLUMN `summary_request_id` VARCHAR(191) NULL,
    MODIFY `status` ENUM('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED', 'ORDERED', 'SUBMITTED', 'COLLECTED') NOT NULL DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE `stock_counts` MODIFY `status` ENUM('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED', 'PURCHASED', 'PENDING_RECEIPT', 'PARTIALLY_RECEIVED') NOT NULL DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE `stock_issues` MODIFY `status` ENUM('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED', 'PURCHASED', 'PENDING_RECEIPT', 'PARTIALLY_RECEIVED') NOT NULL DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE `stock_transfers` MODIFY `status` ENUM('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED', 'PURCHASED', 'PENDING_RECEIPT', 'PARTIALLY_RECEIVED') NOT NULL DEFAULT 'DRAFT';

-- CreateTable
CREATE TABLE `goods_receipt_confirmations` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `goods_receipt_id` VARCHAR(191) NOT NULL,
    `confirmed_by_id` VARCHAR(191) NOT NULL,
    `confirmed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `express_no` VARCHAR(191) NULL,
    `note` TEXT NULL,

    INDEX `goods_receipt_confirmations_goods_receipt_id_confirmed_at_idx`(`goods_receipt_id`, `confirmed_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `goods_receipt_confirmation_lines` (
    `id` VARCHAR(191) NOT NULL,
    `confirmation_id` VARCHAR(191) NOT NULL,
    `goods_receipt_item_id` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `expires_at` DATETIME(3) NULL,
    `note` VARCHAR(191) NULL,

    INDEX `goods_receipt_confirmation_lines_confirmation_id_idx`(`confirmation_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `purchase_requests_tenant_id_kind_status_idx` ON `purchase_requests`(`tenant_id`, `kind`, `status`);

-- AddForeignKey
ALTER TABLE `purchase_requests` ADD CONSTRAINT `purchase_requests_summary_request_id_fkey` FOREIGN KEY (`summary_request_id`) REFERENCES `purchase_requests`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `goods_receipt_confirmations` ADD CONSTRAINT `goods_receipt_confirmations_goods_receipt_id_fkey` FOREIGN KEY (`goods_receipt_id`) REFERENCES `goods_receipts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `goods_receipt_confirmation_lines` ADD CONSTRAINT `goods_receipt_confirmation_lines_confirmation_id_fkey` FOREIGN KEY (`confirmation_id`) REFERENCES `goods_receipt_confirmations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `goods_receipt_confirmation_lines` ADD CONSTRAINT `goods_receipt_confirmation_lines_goods_receipt_item_id_fkey` FOREIGN KEY (`goods_receipt_item_id`) REFERENCES `goods_receipt_items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

