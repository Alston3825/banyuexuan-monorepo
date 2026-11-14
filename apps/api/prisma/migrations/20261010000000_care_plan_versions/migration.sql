-- CreateTable
CREATE TABLE `care_plan_versions` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NOT NULL,
    `mother_profile_id` VARCHAR(191) NOT NULL,
    `baby_profile_id` VARCHAR(191) NULL,
    `version_no` INTEGER NOT NULL,
    `status` ENUM('DRAFT', 'PENDING_REVIEW', 'ACTIVE', 'SUPERSEDED', 'REJECTED') NOT NULL DEFAULT 'DRAFT',
    `level` ENUM('LEVEL1', 'LEVEL2', 'LEVEL3') NOT NULL,
    `source` ENUM('INITIAL', 'REGULAR_REVIEW', 'DIRECTOR_ROUND') NOT NULL DEFAULT 'INITIAL',
    `assessment_summary` TEXT NULL,
    `focus_points` TEXT NULL,
    `measures` JSON NULL,
    `progress_note` TEXT NULL,
    `adjust_reason` TEXT NULL,
    `previous_version_id` VARCHAR(191) NULL,
    `created_by` VARCHAR(191) NOT NULL,
    `created_by_name` VARCHAR(191) NULL,
    `submitted_at` DATETIME(3) NULL,
    `reviewer_id` VARCHAR(191) NULL,
    `reviewer_name` VARCHAR(191) NULL,
    `reviewed_at` DATETIME(3) NULL,
    `review_comment` TEXT NULL,
    `effective_at` DATETIME(3) NULL,
    `next_review_due` DATE NULL,
    `ended_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 0,

    INDEX `care_plan_versions_tenant_id_mother_profile_id_status_idx`(`tenant_id`, `mother_profile_id`, `status`),
    INDEX `care_plan_versions_tenant_id_status_next_review_due_idx`(`tenant_id`, `status`, `next_review_due`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `care_service_logs` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NOT NULL,
    `mother_profile_id` VARCHAR(191) NOT NULL,
    `baby_profile_id` VARCHAR(191) NULL,
    `service_code` VARCHAR(191) NOT NULL,
    `done_date` DATE NOT NULL,
    `done_by_name` VARCHAR(191) NULL,
    `client_signed` BOOLEAN NOT NULL DEFAULT false,
    `note` VARCHAR(191) NULL,
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `care_service_logs_tenant_id_mother_profile_id_service_code_idx`(`tenant_id`, `mother_profile_id`, `service_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `care_plan_versions` ADD CONSTRAINT `care_plan_versions_mother_profile_id_fkey` FOREIGN KEY (`mother_profile_id`) REFERENCES `mother_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `care_plan_versions` ADD CONSTRAINT `care_plan_versions_baby_profile_id_fkey` FOREIGN KEY (`baby_profile_id`) REFERENCES `baby_profiles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `care_service_logs` ADD CONSTRAINT `care_service_logs_mother_profile_id_fkey` FOREIGN KEY (`mother_profile_id`) REFERENCES `mother_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `care_service_logs` ADD CONSTRAINT `care_service_logs_baby_profile_id_fkey` FOREIGN KEY (`baby_profile_id`) REFERENCES `baby_profiles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

