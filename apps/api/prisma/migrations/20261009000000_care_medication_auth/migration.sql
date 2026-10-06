-- CreateTable
CREATE TABLE `care_medication_auths` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NOT NULL,
    `mother_profile_id` VARCHAR(191) NOT NULL,
    `baby_profile_id` VARCHAR(191) NOT NULL,
    `previous_auth_id` VARCHAR(191) NULL,
    `status` ENUM('ACTIVE', 'SUPERSEDED', 'STOPPED') NOT NULL DEFAULT 'ACTIVE',
    `auth_date` DATE NULL,
    `medication_start` DATE NULL,
    `signer_name` VARCHAR(191) NULL,
    `nurse_name` VARCHAR(191) NULL,
    `change_note` TEXT NULL,
    `remark` TEXT NULL,
    `stopped_at` DATETIME(3) NULL,
    `stopped_by` VARCHAR(191) NULL,
    `stop_note` TEXT NULL,
    `document_id` VARCHAR(191) NULL,
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 0,

    INDEX `care_medication_auths_tenant_id_baby_profile_id_status_idx`(`tenant_id`, `baby_profile_id`, `status`),
    INDEX `care_medication_auths_tenant_id_mother_profile_id_idx`(`tenant_id`, `mother_profile_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `care_medication_items` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `auth_id` VARCHAR(191) NOT NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `drug_name` VARCHAR(191) NOT NULL,
    `route` VARCHAR(191) NULL,
    `times` JSON NULL,
    `dose` VARCHAR(191) NULL,
    `course_days` INTEGER NULL,
    `start_date` DATE NULL,
    `end_date` DATE NULL,
    `notes` TEXT NULL,
    `family_signed` VARCHAR(191) NULL,

    INDEX `care_medication_items_auth_id_idx`(`auth_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `care_medication_auths` ADD CONSTRAINT `care_medication_auths_mother_profile_id_fkey` FOREIGN KEY (`mother_profile_id`) REFERENCES `mother_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `care_medication_auths` ADD CONSTRAINT `care_medication_auths_baby_profile_id_fkey` FOREIGN KEY (`baby_profile_id`) REFERENCES `baby_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `care_medication_auths` ADD CONSTRAINT `care_medication_auths_previous_auth_id_fkey` FOREIGN KEY (`previous_auth_id`) REFERENCES `care_medication_auths`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `care_medication_auths` ADD CONSTRAINT `care_medication_auths_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `care_documents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `care_medication_items` ADD CONSTRAINT `care_medication_items_auth_id_fkey` FOREIGN KEY (`auth_id`) REFERENCES `care_medication_auths`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

