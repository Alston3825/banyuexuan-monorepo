-- CreateTable
CREATE TABLE `care_field_definitions` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `target_type` ENUM('MOTHER', 'BABY') NOT NULL,
    `control_type` ENUM('NUMBER', 'TEXT', 'TEXTAREA', 'SELECT', 'RADIO') NOT NULL,
    `unit` VARCHAR(191) NULL,
    `options` JSON NULL,
    `normal_min` DOUBLE NULL,
    `normal_max` DOUBLE NULL,
    `normal_option_values` JSON NULL,
    `visible_to_client` BOOLEAN NOT NULL DEFAULT false,
    `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `care_field_definitions_tenant_id_code_key`(`tenant_id`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `care_form_templates` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `target_type` ENUM('MOTHER', 'BABY') NOT NULL,
    `department` ENUM('NURSING', 'POSTPARTUM_RECOVERY', 'MEAL', 'CUSTOMER_SERVICE', 'MEDICAL') NOT NULL,
    `scene` ENUM('GENERAL', 'IN_HOUSE', 'HOME_VISIT', 'HOSPITAL') NOT NULL DEFAULT 'GENERAL',
    `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `care_form_templates_tenant_id_code_key`(`tenant_id`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `care_form_template_fields` (
    `id` VARCHAR(191) NOT NULL,
    `form_template_id` VARCHAR(191) NOT NULL,
    `field_id` VARCHAR(191) NOT NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `required` BOOLEAN NOT NULL DEFAULT false,

    UNIQUE INDEX `care_form_template_fields_form_template_id_field_id_key`(`form_template_id`, `field_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `care_plan_templates` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `target_type` ENUM('MOTHER', 'BABY') NOT NULL,
    `total_days` INTEGER NOT NULL,
    `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `care_plan_templates_tenant_id_code_key`(`tenant_id`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `care_plan_template_items` (
    `id` VARCHAR(191) NOT NULL,
    `plan_template_id` VARCHAR(191) NOT NULL,
    `day_offset` INTEGER NOT NULL,
    `form_template_id` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `care_plan_template_items_plan_template_id_day_offset_form_te_key`(`plan_template_id`, `day_offset`, `form_template_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mother_profiles` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NOT NULL,
    `customer_id` VARCHAR(191) NOT NULL,
    `occupancy_id` VARCHAR(191) NULL,
    `delivery_method` ENUM('VAGINAL', 'CESAREAN', 'UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
    `delivery_date` DATETIME(3) NULL,
    `gestational_weeks` INTEGER NULL,
    `expected_delivery_date` DATETIME(3) NULL,
    `remark` TEXT NULL,
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 0,

    INDEX `mother_profiles_tenant_id_customer_id_idx`(`tenant_id`, `customer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `baby_profiles` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NOT NULL,
    `customer_id` VARCHAR(191) NOT NULL,
    `mother_profile_id` VARCHAR(191) NOT NULL,
    `sequence_no` INTEGER NOT NULL DEFAULT 1,
    `name` VARCHAR(191) NULL,
    `gender` ENUM('MALE', 'FEMALE', 'UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
    `birth_date` DATETIME(3) NULL,
    `birth_weight_grams` INTEGER NULL,
    `apgar_score` VARCHAR(191) NULL,
    `remark` TEXT NULL,
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 0,

    INDEX `baby_profiles_tenant_id_customer_id_idx`(`tenant_id`, `customer_id`),
    UNIQUE INDEX `baby_profiles_mother_profile_id_sequence_no_key`(`mother_profile_id`, `sequence_no`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `care_plans` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NOT NULL,
    `plan_no` VARCHAR(191) NOT NULL,
    `plan_template_id` VARCHAR(191) NOT NULL,
    `mother_profile_id` VARCHAR(191) NULL,
    `baby_profile_id` VARCHAR(191) NULL,
    `start_date` DATETIME(3) NOT NULL,
    `status` ENUM('DRAFT', 'ACTIVE', 'COMPLETED', 'TERMINATED') NOT NULL DEFAULT 'DRAFT',
    `terminate_reason` TEXT NULL,
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 0,

    INDEX `care_plans_tenant_id_mother_profile_id_idx`(`tenant_id`, `mother_profile_id`),
    INDEX `care_plans_tenant_id_baby_profile_id_idx`(`tenant_id`, `baby_profile_id`),
    UNIQUE INDEX `care_plans_tenant_id_plan_no_key`(`tenant_id`, `plan_no`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `care_plan_tasks` (
    `id` VARCHAR(191) NOT NULL,
    `care_plan_id` VARCHAR(191) NOT NULL,
    `day_offset` INTEGER NOT NULL,
    `scheduled_date` DATETIME(3) NOT NULL,
    `form_template_id` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDING', 'COMPLETED', 'MISSED') NOT NULL DEFAULT 'PENDING',
    `care_record_id` VARCHAR(191) NULL,

    UNIQUE INDEX `care_plan_tasks_care_record_id_key`(`care_record_id`),
    INDEX `care_plan_tasks_care_plan_id_scheduled_date_idx`(`care_plan_id`, `scheduled_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `care_records` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NOT NULL,
    `record_no` VARCHAR(191) NOT NULL,
    `form_template_id` VARCHAR(191) NOT NULL,
    `target_type` ENUM('MOTHER', 'BABY') NOT NULL,
    `mother_profile_id` VARCHAR(191) NULL,
    `baby_profile_id` VARCHAR(191) NULL,
    `occurred_at` DATETIME(3) NOT NULL,
    `values` JSON NOT NULL,
    `is_backfilled` BOOLEAN NOT NULL DEFAULT false,
    `backfill_reason` TEXT NULL,
    `correction_of_id` VARCHAR(191) NULL,
    `submitted_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `care_records_tenant_id_mother_profile_id_idx`(`tenant_id`, `mother_profile_id`),
    INDEX `care_records_tenant_id_baby_profile_id_idx`(`tenant_id`, `baby_profile_id`),
    UNIQUE INDEX `care_records_tenant_id_record_no_key`(`tenant_id`, `record_no`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `care_abnormalities` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NOT NULL,
    `care_record_id` VARCHAR(191) NOT NULL,
    `field_id` VARCHAR(191) NOT NULL,
    `target_type` ENUM('MOTHER', 'BABY') NOT NULL,
    `mother_profile_id` VARCHAR(191) NULL,
    `baby_profile_id` VARCHAR(191) NULL,
    `occurred_at` DATETIME(3) NOT NULL,
    `field_value` JSON NOT NULL,
    `status` ENUM('OPEN', 'FOLLOWING', 'RESOLVED', 'IGNORED') NOT NULL DEFAULT 'OPEN',
    `resolved_by` VARCHAR(191) NULL,
    `resolved_at` DATETIME(3) NULL,
    `resolve_note` TEXT NULL,
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 0,

    INDEX `care_abnormalities_tenant_id_status_idx`(`tenant_id`, `status`),
    INDEX `care_abnormalities_tenant_id_mother_profile_id_idx`(`tenant_id`, `mother_profile_id`),
    INDEX `care_abnormalities_tenant_id_baby_profile_id_idx`(`tenant_id`, `baby_profile_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `care_form_template_fields` ADD CONSTRAINT `care_form_template_fields_form_template_id_fkey` FOREIGN KEY (`form_template_id`) REFERENCES `care_form_templates`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `care_form_template_fields` ADD CONSTRAINT `care_form_template_fields_field_id_fkey` FOREIGN KEY (`field_id`) REFERENCES `care_field_definitions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `care_plan_template_items` ADD CONSTRAINT `care_plan_template_items_plan_template_id_fkey` FOREIGN KEY (`plan_template_id`) REFERENCES `care_plan_templates`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `care_plan_template_items` ADD CONSTRAINT `care_plan_template_items_form_template_id_fkey` FOREIGN KEY (`form_template_id`) REFERENCES `care_form_templates`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mother_profiles` ADD CONSTRAINT `mother_profiles_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mother_profiles` ADD CONSTRAINT `mother_profiles_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mother_profiles` ADD CONSTRAINT `mother_profiles_occupancy_id_fkey` FOREIGN KEY (`occupancy_id`) REFERENCES `room_occupancies`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `baby_profiles` ADD CONSTRAINT `baby_profiles_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `baby_profiles` ADD CONSTRAINT `baby_profiles_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `baby_profiles` ADD CONSTRAINT `baby_profiles_mother_profile_id_fkey` FOREIGN KEY (`mother_profile_id`) REFERENCES `mother_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `care_plans` ADD CONSTRAINT `care_plans_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `care_plans` ADD CONSTRAINT `care_plans_plan_template_id_fkey` FOREIGN KEY (`plan_template_id`) REFERENCES `care_plan_templates`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `care_plans` ADD CONSTRAINT `care_plans_mother_profile_id_fkey` FOREIGN KEY (`mother_profile_id`) REFERENCES `mother_profiles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `care_plans` ADD CONSTRAINT `care_plans_baby_profile_id_fkey` FOREIGN KEY (`baby_profile_id`) REFERENCES `baby_profiles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `care_plan_tasks` ADD CONSTRAINT `care_plan_tasks_care_plan_id_fkey` FOREIGN KEY (`care_plan_id`) REFERENCES `care_plans`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `care_plan_tasks` ADD CONSTRAINT `care_plan_tasks_form_template_id_fkey` FOREIGN KEY (`form_template_id`) REFERENCES `care_form_templates`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `care_plan_tasks` ADD CONSTRAINT `care_plan_tasks_care_record_id_fkey` FOREIGN KEY (`care_record_id`) REFERENCES `care_records`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `care_records` ADD CONSTRAINT `care_records_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `care_records` ADD CONSTRAINT `care_records_form_template_id_fkey` FOREIGN KEY (`form_template_id`) REFERENCES `care_form_templates`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `care_records` ADD CONSTRAINT `care_records_mother_profile_id_fkey` FOREIGN KEY (`mother_profile_id`) REFERENCES `mother_profiles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `care_records` ADD CONSTRAINT `care_records_baby_profile_id_fkey` FOREIGN KEY (`baby_profile_id`) REFERENCES `baby_profiles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `care_records` ADD CONSTRAINT `care_records_correction_of_id_fkey` FOREIGN KEY (`correction_of_id`) REFERENCES `care_records`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `care_abnormalities` ADD CONSTRAINT `care_abnormalities_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `care_abnormalities` ADD CONSTRAINT `care_abnormalities_care_record_id_fkey` FOREIGN KEY (`care_record_id`) REFERENCES `care_records`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `care_abnormalities` ADD CONSTRAINT `care_abnormalities_field_id_fkey` FOREIGN KEY (`field_id`) REFERENCES `care_field_definitions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `care_abnormalities` ADD CONSTRAINT `care_abnormalities_mother_profile_id_fkey` FOREIGN KEY (`mother_profile_id`) REFERENCES `mother_profiles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `care_abnormalities` ADD CONSTRAINT `care_abnormalities_baby_profile_id_fkey` FOREIGN KEY (`baby_profile_id`) REFERENCES `baby_profiles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
