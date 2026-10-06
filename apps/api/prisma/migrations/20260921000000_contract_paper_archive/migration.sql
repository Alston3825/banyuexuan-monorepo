-- DropForeignKey
ALTER TABLE `contracts` DROP FOREIGN KEY `contracts_customer_id_fkey`;

-- DropForeignKey
ALTER TABLE `contracts` DROP FOREIGN KEY `contracts_renewal_of_contract_id_fkey`;

-- DropForeignKey
ALTER TABLE `contracts` DROP FOREIGN KEY `contracts_template_id_fkey`;

-- DropIndex
DROP INDEX `contracts_customer_id_fkey` ON `contracts`;

-- DropIndex
DROP INDEX `contracts_renewal_of_contract_id_fkey` ON `contracts`;

-- DropIndex
DROP INDEX `contracts_template_id_fkey` ON `contracts`;

-- AlterTable
ALTER TABLE `contracts` DROP COLUMN `renewal_of_contract_id`,
    DROP COLUMN `signed_by_customer_at`,
    DROP COLUMN `signed_by_customer_ip`,
    DROP COLUMN `template_id`,
    ADD COLUMN `care_mode` ENUM('ONE_TO_ONE', 'ONE_TO_TWO') NULL,
    ADD COLUMN `client_address` TEXT NULL,
    ADD COLUMN `client_hospital` VARCHAR(191) NULL,
    ADD COLUMN `client_id_card_no` VARCHAR(191) NULL,
    ADD COLUMN `client_name` VARCHAR(191) NULL,
    ADD COLUMN `client_phone` VARCHAR(191) NULL,
    ADD COLUMN `confirmed_at` DATETIME(3) NULL,
    ADD COLUMN `confirmed_by_id` VARCHAR(191) NULL,
    ADD COLUMN `days_text` VARCHAR(191) NULL,
    ADD COLUMN `deposit_amount` INTEGER NULL,
    ADD COLUMN `deposit_method` ENUM('CASH', 'BANK_TRANSFER', 'WECHAT', 'ALIPAY', 'POS_CARD', 'OTHER') NULL,
    ADD COLUMN `deposit_paid` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `deposit_paid_at` DATE NULL,
    ADD COLUMN `deposit_payment_id` VARCHAR(191) NULL,
    ADD COLUMN `due_date` DATE NULL,
    ADD COLUMN `emergency_name` VARCHAR(191) NULL,
    ADD COLUMN `emergency_phone` VARCHAR(191) NULL,
    ADD COLUMN `emergency_relation` VARCHAR(191) NULL,
    ADD COLUMN `estimated_check_in` DATE NULL,
    ADD COLUMN `estimated_check_out` DATE NULL,
    ADD COLUMN `extract_error` TEXT NULL,
    ADD COLUMN `extract_status` ENUM('NONE', 'PENDING', 'RUNNING', 'DONE', 'FAILED') NOT NULL DEFAULT 'NONE',
    ADD COLUMN `extract_warnings` JSON NULL,
    ADD COLUMN `extracted_at` DATETIME(3) NULL,
    ADD COLUMN `fetus` VARCHAR(191) NULL,
    ADD COLUMN `home_service_days` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `in_house_days` INTEGER NULL,
    ADD COLUMN `orientation` ENUM('SOUTH', 'NORTH', 'BOTH') NULL,
    ADD COLUMN `paper_no` VARCHAR(191) NULL,
    ADD COLUMN `room_type_id` VARCHAR(191) NULL,
    ADD COLUMN `room_type_text` VARCHAR(191) NULL,
    ADD COLUMN `signed_date` DATE NULL,
    ADD COLUMN `signer_id` VARCHAR(191) NULL,
    MODIFY `customer_id` VARCHAR(191) NULL,
    MODIFY `title` VARCHAR(191) NOT NULL DEFAULT '母婴护理服务协议',
    MODIFY `content` TEXT NULL,
    MODIFY `amount` INTEGER NOT NULL DEFAULT 0,
    MODIFY `start_date` DATETIME(3) NULL,
    MODIFY `end_date` DATETIME(3) NULL,
    MODIFY `status` ENUM('DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'REJECTED', 'VOIDED', 'PENDING_REVIEW') NOT NULL DEFAULT 'PENDING_REVIEW';

-- AlterTable
ALTER TABLE `customers` ADD COLUMN `emergency_contact_name` VARCHAR(191) NULL,
    ADD COLUMN `emergency_contact_phone` VARCHAR(191) NULL,
    ADD COLUMN `emergency_contact_relation` VARCHAR(191) NULL,
    ADD COLUMN `id_card_no` VARCHAR(191) NULL;

-- DropTable
DROP TABLE `contract_templates`;

-- CreateTable
CREATE TABLE `contract_files` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `contract_id` VARCHAR(191) NOT NULL,
    `kind` ENUM('ORIGINAL', 'PAGE') NOT NULL,
    `file_name` VARCHAR(191) NOT NULL,
    `storage_path` VARCHAR(191) NOT NULL,
    `mime_type` VARCHAR(191) NOT NULL,
    `size_bytes` INTEGER NOT NULL,
    `page_no` INTEGER NULL,
    `page_kind` VARCHAR(191) NULL,
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `contract_files_contract_id_idx`(`contract_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `contract_items` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `contract_id` VARCHAR(191) NOT NULL,
    `kind` ENUM('GIFT', 'ADDON') NOT NULL DEFAULT 'GIFT',
    `name` VARCHAR(191) NOT NULL,
    `quantity` VARCHAR(191) NULL,
    `needs_review` BOOLEAN NOT NULL DEFAULT false,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `contract_items_contract_id_idx`(`contract_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `contract_extractions` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `contract_id` VARCHAR(191) NOT NULL,
    `model` VARCHAR(191) NULL,
    `latency_ms` INTEGER NULL,
    `result` JSON NOT NULL,
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `contract_extractions_contract_id_idx`(`contract_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `contracts_tenant_id_paper_no_idx` ON `contracts`(`tenant_id`, `paper_no`);

-- AddForeignKey
ALTER TABLE `contracts` ADD CONSTRAINT `contracts_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contracts` ADD CONSTRAINT `contracts_signer_id_fkey` FOREIGN KEY (`signer_id`) REFERENCES `accounts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contracts` ADD CONSTRAINT `contracts_room_type_id_fkey` FOREIGN KEY (`room_type_id`) REFERENCES `room_types`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contract_files` ADD CONSTRAINT `contract_files_contract_id_fkey` FOREIGN KEY (`contract_id`) REFERENCES `contracts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contract_items` ADD CONSTRAINT `contract_items_contract_id_fkey` FOREIGN KEY (`contract_id`) REFERENCES `contracts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `contract_extractions` ADD CONSTRAINT `contract_extractions_contract_id_fkey` FOREIGN KEY (`contract_id`) REFERENCES `contracts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

