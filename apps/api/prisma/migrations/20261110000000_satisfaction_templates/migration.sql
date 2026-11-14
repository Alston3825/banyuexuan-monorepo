ALTER TABLE `satisfaction_surveys` ADD COLUMN `template_id` VARCHAR(191) NULL;
CREATE INDEX `satisfaction_surveys_tenant_id_template_id_idx` ON `satisfaction_surveys`(`tenant_id`, `template_id`);

CREATE TABLE `satisfaction_templates` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `sort_no` INTEGER NOT NULL DEFAULT 1,
    `day` INTEGER NULL,
    `good_word` VARCHAR(191) NOT NULL DEFAULT '好',
    `bad_word` VARCHAR(191) NOT NULL DEFAULT '不好',
    `suggestion_label` VARCHAR(191) NOT NULL,
    `praise_label` VARCHAR(191) NOT NULL,
    `groups` JSON NOT NULL,
    `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `source` VARCHAR(191) NOT NULL DEFAULT 'MANUAL',
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 0,

    INDEX `satisfaction_templates_tenant_id_status_idx`(`tenant_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
