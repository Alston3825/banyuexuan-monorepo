-- CreateTable
CREATE TABLE `employee_profiles` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `account_id` VARCHAR(191) NOT NULL,
    `employee_no` VARCHAR(191) NOT NULL,
    `hire_date` DATETIME(3) NOT NULL,
    `employment_type` ENUM('EMPLOYEE', 'NON_EMPLOYEE') NOT NULL DEFAULT 'EMPLOYEE',
    `health_cert_expires_at` DATETIME(3) NULL,
    `contract_expires_at` DATETIME(3) NULL,
    `probation_ends_at` DATETIME(3) NULL,
    `termination_date` DATETIME(3) NULL,
    `status` ENUM('ACTIVE', 'ON_LEAVE', 'TERMINATED') NOT NULL DEFAULT 'ACTIVE',
    `remark` TEXT NULL,
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `employee_profiles_account_id_key`(`account_id`),
    UNIQUE INDEX `employee_profiles_tenant_id_employee_no_key`(`tenant_id`, `employee_no`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `shift_definitions` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `start_time` VARCHAR(191) NOT NULL,
    `end_time` VARCHAR(191) NOT NULL,
    `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `shift_definitions_tenant_id_store_id_code_key`(`tenant_id`, `store_id`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `schedule_entries` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NOT NULL,
    `employee_profile_id` VARCHAR(191) NOT NULL,
    `work_date` DATETIME(3) NOT NULL,
    `shift_definition_id` VARCHAR(191) NOT NULL,
    `remark` TEXT NULL,
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 0,

    INDEX `schedule_entries_tenant_id_store_id_work_date_idx`(`tenant_id`, `store_id`, `work_date`),
    UNIQUE INDEX `schedule_entries_employee_profile_id_work_date_key`(`employee_profile_id`, `work_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `commission_records` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NOT NULL,
    `type` ENUM('SALES', 'LABOR') NOT NULL,
    `source_type` VARCHAR(191) NOT NULL,
    `source_id` VARCHAR(191) NOT NULL,
    `total_amount` INTEGER NOT NULL,
    `status` ENUM('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
    `remark` TEXT NULL,
    `cancel_reason` TEXT NULL,
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 0,

    INDEX `commission_records_tenant_id_store_id_status_idx`(`tenant_id`, `store_id`, `status`),
    INDEX `commission_records_tenant_id_source_type_source_id_idx`(`tenant_id`, `source_type`, `source_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `commission_allocations` (
    `id` VARCHAR(191) NOT NULL,
    `commission_record_id` VARCHAR(191) NOT NULL,
    `employee_profile_id` VARCHAR(191) NOT NULL,
    `role_label` VARCHAR(191) NOT NULL,
    `basis_points` INTEGER NOT NULL,
    `amount` INTEGER NOT NULL,

    INDEX `commission_allocations_employee_profile_id_idx`(`employee_profile_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payroll_records` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NOT NULL,
    `employee_profile_id` VARCHAR(191) NOT NULL,
    `period` VARCHAR(191) NOT NULL,
    `base_salary` INTEGER NOT NULL,
    `commission_total` INTEGER NOT NULL DEFAULT 0,
    `deductions` INTEGER NOT NULL DEFAULT 0,
    `net_amount` INTEGER NOT NULL,
    `status` ENUM('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'PAID') NOT NULL DEFAULT 'DRAFT',
    `paid_at` DATETIME(3) NULL,
    `remark` TEXT NULL,
    `cancel_reason` TEXT NULL,
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 0,

    INDEX `payroll_records_tenant_id_store_id_status_idx`(`tenant_id`, `store_id`, `status`),
    UNIQUE INDEX `payroll_records_tenant_id_employee_profile_id_period_key`(`tenant_id`, `employee_profile_id`, `period`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `employee_profiles` ADD CONSTRAINT `employee_profiles_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shift_definitions` ADD CONSTRAINT `shift_definitions_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `schedule_entries` ADD CONSTRAINT `schedule_entries_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `schedule_entries` ADD CONSTRAINT `schedule_entries_employee_profile_id_fkey` FOREIGN KEY (`employee_profile_id`) REFERENCES `employee_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `schedule_entries` ADD CONSTRAINT `schedule_entries_shift_definition_id_fkey` FOREIGN KEY (`shift_definition_id`) REFERENCES `shift_definitions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `commission_records` ADD CONSTRAINT `commission_records_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `commission_allocations` ADD CONSTRAINT `commission_allocations_commission_record_id_fkey` FOREIGN KEY (`commission_record_id`) REFERENCES `commission_records`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `commission_allocations` ADD CONSTRAINT `commission_allocations_employee_profile_id_fkey` FOREIGN KEY (`employee_profile_id`) REFERENCES `employee_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payroll_records` ADD CONSTRAINT `payroll_records_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payroll_records` ADD CONSTRAINT `payroll_records_employee_profile_id_fkey` FOREIGN KEY (`employee_profile_id`) REFERENCES `employee_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
