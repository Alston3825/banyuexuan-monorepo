-- CreateTable
CREATE TABLE `ai_suggestions` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NOT NULL,
    `scenario` ENUM('CUSTOMER_SERVICE', 'CARE_ABNORMALITY') NOT NULL,
    `business_type` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `input_text` TEXT NOT NULL,
    `output_text` TEXT NOT NULL,
    `model_provider` VARCHAR(191) NOT NULL,
    `model_name` VARCHAR(191) NOT NULL,
    `used_fallback` BOOLEAN NOT NULL DEFAULT false,
    `latency_ms` INTEGER NOT NULL,
    `escalate` BOOLEAN NOT NULL DEFAULT false,
    `status` ENUM('PENDING', 'ACCEPTED', 'DISMISSED') NOT NULL DEFAULT 'PENDING',
    `accepted_by_id` VARCHAR(191) NULL,
    `accepted_at` DATETIME(3) NULL,
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 0,

    INDEX `ai_suggestions_tenant_id_store_id_scenario_idx`(`tenant_id`, `store_id`, `scenario`),
    INDEX `ai_suggestions_tenant_id_business_type_business_id_idx`(`tenant_id`, `business_type`, `business_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ai_suggestions` ADD CONSTRAINT `ai_suggestions_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_suggestions` ADD CONSTRAINT `ai_suggestions_accepted_by_id_fkey` FOREIGN KEY (`accepted_by_id`) REFERENCES `accounts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
