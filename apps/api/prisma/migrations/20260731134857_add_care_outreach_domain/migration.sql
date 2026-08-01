-- CreateTable
CREATE TABLE `care_outreach_templates` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `care_outreach_templates_tenant_id_code_key`(`tenant_id`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `care_outreach_template_items` (
    `id` VARCHAR(191) NOT NULL,
    `template_id` VARCHAR(191) NOT NULL,
    `day_offset` INTEGER NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `content` TEXT NULL,

    UNIQUE INDEX `care_outreach_template_items_template_id_day_offset_title_key`(`template_id`, `day_offset`, `title`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `care_outreach_plans` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NOT NULL,
    `plan_no` VARCHAR(191) NOT NULL,
    `template_id` VARCHAR(191) NOT NULL,
    `mother_profile_id` VARCHAR(191) NOT NULL,
    `checked_out_at` DATETIME(3) NOT NULL,
    `status` ENUM('ACTIVE', 'COMPLETED', 'TERMINATED') NOT NULL DEFAULT 'ACTIVE',
    `terminate_reason` TEXT NULL,
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 0,

    INDEX `care_outreach_plans_tenant_id_mother_profile_id_idx`(`tenant_id`, `mother_profile_id`),
    UNIQUE INDEX `care_outreach_plans_tenant_id_plan_no_key`(`tenant_id`, `plan_no`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `care_outreach_tasks` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NOT NULL,
    `plan_id` VARCHAR(191) NOT NULL,
    `day_offset` INTEGER NOT NULL,
    `scheduled_date` DATETIME(3) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `content` TEXT NULL,
    `status` ENUM('PENDING', 'COMPLETED', 'SKIPPED') NOT NULL DEFAULT 'PENDING',
    `completed_by_id` VARCHAR(191) NULL,
    `completed_at` DATETIME(3) NULL,
    `completion_note` TEXT NULL,

    INDEX `care_outreach_tasks_tenant_id_plan_id_idx`(`tenant_id`, `plan_id`),
    INDEX `care_outreach_tasks_tenant_id_store_id_scheduled_date_idx`(`tenant_id`, `store_id`, `scheduled_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `care_outreach_template_items` ADD CONSTRAINT `care_outreach_template_items_template_id_fkey` FOREIGN KEY (`template_id`) REFERENCES `care_outreach_templates`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `care_outreach_plans` ADD CONSTRAINT `care_outreach_plans_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `care_outreach_plans` ADD CONSTRAINT `care_outreach_plans_template_id_fkey` FOREIGN KEY (`template_id`) REFERENCES `care_outreach_templates`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `care_outreach_plans` ADD CONSTRAINT `care_outreach_plans_mother_profile_id_fkey` FOREIGN KEY (`mother_profile_id`) REFERENCES `mother_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `care_outreach_tasks` ADD CONSTRAINT `care_outreach_tasks_plan_id_fkey` FOREIGN KEY (`plan_id`) REFERENCES `care_outreach_plans`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `care_outreach_tasks` ADD CONSTRAINT `care_outreach_tasks_completed_by_id_fkey` FOREIGN KEY (`completed_by_id`) REFERENCES `accounts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `care_outreach_tasks` ADD CONSTRAINT `care_outreach_tasks_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
