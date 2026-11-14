-- CreateTable
CREATE TABLE `care_documents` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NOT NULL,
    `doc_type` ENUM('MOTHER_ADMISSION', 'BABY_ADMISSION', 'MOTHER_DISCHARGE', 'BABY_DISCHARGE', 'DAILY_RECORD', 'MEDICATION_AUTH', 'CARE_PLAN', 'RISK_NOTICE', 'ORIENTATION', 'CHOKING_PROTOCOL', 'OTHER') NOT NULL,
    `mother_profile_id` VARCHAR(191) NOT NULL,
    `baby_profile_id` VARCHAR(191) NULL,
    `status` ENUM('DRAFT', 'CONFIRMED') NOT NULL DEFAULT 'DRAFT',
    `title` VARCHAR(191) NULL,
    `doc_date` DATE NULL,
    `remark` TEXT NULL,
    `extract_status` ENUM('NONE', 'PENDING', 'RUNNING', 'DONE', 'FAILED') NOT NULL DEFAULT 'NONE',
    `extract_error` TEXT NULL,
    `extract_data` JSON NULL,
    `extract_warnings` JSON NULL,
    `extract_model` VARCHAR(191) NULL,
    `extracted_at` DATETIME(3) NULL,
    `confirmed_by` VARCHAR(191) NULL,
    `confirmed_at` DATETIME(3) NULL,
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 0,

    INDEX `care_documents_tenant_id_mother_profile_id_doc_type_idx`(`tenant_id`, `mother_profile_id`, `doc_type`),
    INDEX `care_documents_tenant_id_status_idx`(`tenant_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `care_document_files` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `document_id` VARCHAR(191) NOT NULL,
    `file_name` VARCHAR(191) NOT NULL,
    `storage_path` VARCHAR(191) NOT NULL,
    `mime_type` VARCHAR(191) NOT NULL,
    `size_bytes` INTEGER NOT NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `care_document_files_document_id_idx`(`document_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `care_mother_admissions` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NOT NULL,
    `mother_profile_id` VARCHAR(191) NOT NULL,
    `document_id` VARCHAR(191) NULL,
    `age` INTEGER NULL,
    `gestational_weeks` VARCHAR(191) NULL,
    `blood_type` VARCHAR(191) NULL,
    `delivery_hospital` VARCHAR(191) NULL,
    `admission_date` DATE NULL,
    `delivery_date` DATE NULL,
    `delivery_method` VARCHAR(191) NULL,
    `height_cm` DOUBLE NULL,
    `weight_kg` DOUBLE NULL,
    `chief_complaint` VARCHAR(191) NULL,
    `allergy_history` VARCHAR(191) NULL,
    `allergy_note` VARCHAR(191) NULL,
    `past_history` VARCHAR(191) NULL,
    `pregnancy_complications` VARCHAR(191) NULL,
    `abnormal_delivery_reason` VARCHAR(191) NULL,
    `hemorrhoids` VARCHAR(191) NULL,
    `temperature` DOUBLE NULL,
    `pulse` INTEGER NULL,
    `respiration` INTEGER NULL,
    `bp_systolic` INTEGER NULL,
    `bp_diastolic` INTEGER NULL,
    `fundus_fingers_below_navel` DOUBLE NULL,
    `uterine_contraction` VARCHAR(191) NULL,
    `breast` VARCHAR(191) NULL,
    `breast_note` VARCHAR(191) NULL,
    `nipple` VARCHAR(191) NULL,
    `nipple_note` VARCHAR(191) NULL,
    `perineum` JSON NULL,
    `perineum_note` VARCHAR(191) NULL,
    `wound_dressing` JSON NULL,
    `dressing_note` VARCHAR(191) NULL,
    `lochia_color` VARCHAR(191) NULL,
    `lochia_amount` VARCHAR(191) NULL,
    `lochia_odor` VARCHAR(191) NULL,
    `leg_edema` VARCHAR(191) NULL,
    `night_sweat` VARCHAR(191) NULL,
    `diet_taboo` VARCHAR(191) NULL,
    `handling_notes` TEXT NULL,
    `assessor_name` VARCHAR(191) NULL,
    `responsible_nurse_name` VARCHAR(191) NULL,
    `client_signer_name` VARCHAR(191) NULL,
    `assessed_at` DATE NULL,
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 0,

    INDEX `care_mother_admissions_tenant_id_store_id_idx`(`tenant_id`, `store_id`),
    UNIQUE INDEX `care_mother_admissions_mother_profile_id_key`(`mother_profile_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `care_baby_admissions` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NOT NULL,
    `baby_profile_id` VARCHAR(191) NOT NULL,
    `document_id` VARCHAR(191) NULL,
    `gestational_weeks` VARCHAR(191) NULL,
    `admission_date` DATE NULL,
    `mental_state` VARCHAR(191) NULL,
    `birth_method` VARCHAR(191) NULL,
    `birth_weight_g` INTEGER NULL,
    `birth_length_cm` DOUBLE NULL,
    `admission_weight_g` INTEGER NULL,
    `admission_length_cm` DOUBLE NULL,
    `head_circumference_cm` DOUBLE NULL,
    `chest_circumference_cm` DOUBLE NULL,
    `temperature` DOUBLE NULL,
    `breast_condition` VARCHAR(191) NULL,
    `testis` VARCHAR(191) NULL,
    `hydrocele` VARCHAR(191) NULL,
    `urethra_male` VARCHAR(191) NULL,
    `labia_development` VARCHAR(191) NULL,
    `labia_note` VARCHAR(191) NULL,
    `vaginal_discharge` VARCHAR(191) NULL,
    `vaginal_discharge_note` VARCHAR(191) NULL,
    `urethra_female` VARCHAR(191) NULL,
    `urethra_female_note` VARCHAR(191) NULL,
    `head` VARCHAR(191) NULL,
    `skin` JSON NULL,
    `fontanelle` VARCHAR(191) NULL,
    `facial_features` VARCHAR(191) NULL,
    `oral_cavity` VARCHAR(191) NULL,
    `hearing_screening` VARCHAR(191) NULL,
    `neck` VARCHAR(191) NULL,
    `anus` VARCHAR(191) NULL,
    `lungs` VARCHAR(191) NULL,
    `heart` VARCHAR(191) NULL,
    `heart_note` VARCHAR(191) NULL,
    `abdomen` VARCHAR(191) NULL,
    `limbs` VARCHAR(191) NULL,
    `limbs_note` VARCHAR(191) NULL,
    `umbilical_status` VARCHAR(191) NULL,
    `umbilical_abnormal` JSON NULL,
    `buttocks` VARCHAR(191) NULL,
    `hep_b` VARCHAR(191) NULL,
    `bcg` VARCHAR(191) NULL,
    `vaccine_reason` VARCHAR(191) NULL,
    `jaundice_forehead` DOUBLE NULL,
    `jaundice_canthus` DOUBLE NULL,
    `jaundice_chest` DOUBLE NULL,
    `pku` VARCHAR(191) NULL,
    `pku_reason` VARCHAR(191) NULL,
    `feeding_method` VARCHAR(191) NULL,
    `formula_ml` INTEGER NULL,
    `feeding_status` VARCHAR(191) NULL,
    `feeding_issues` JSON NULL,
    `special_notes` TEXT NULL,
    `assessor_name` VARCHAR(191) NULL,
    `responsible_nurse_name` VARCHAR(191) NULL,
    `client_signer_name` VARCHAR(191) NULL,
    `assessed_at` DATE NULL,
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 0,

    INDEX `care_baby_admissions_tenant_id_store_id_idx`(`tenant_id`, `store_id`),
    UNIQUE INDEX `care_baby_admissions_baby_profile_id_key`(`baby_profile_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `care_mother_discharges` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NOT NULL,
    `mother_profile_id` VARCHAR(191) NOT NULL,
    `document_id` VARCHAR(191) NULL,
    `admission_date` DATE NULL,
    `discharge_date` DATE NULL,
    `age` INTEGER NULL,
    `temperature` DOUBLE NULL,
    `pulse` INTEGER NULL,
    `respiration` INTEGER NULL,
    `bp_systolic` INTEGER NULL,
    `bp_diastolic` INTEGER NULL,
    `height_cm` DOUBLE NULL,
    `weight_kg` DOUBLE NULL,
    `fundus` VARCHAR(191) NULL,
    `fundus_fingers_below_navel` DOUBLE NULL,
    `lochia_amount` VARCHAR(191) NULL,
    `lochia_color` VARCHAR(191) NULL,
    `lochia_property` VARCHAR(191) NULL,
    `lochia_odor` VARCHAR(191) NULL,
    `wound_site` JSON NULL,
    `wound_status` JSON NULL,
    `breast_status` JSON NULL,
    `left_nipple` JSON NULL,
    `right_nipple` JSON NULL,
    `milk_secretion` VARCHAR(191) NULL,
    `hemorrhoids` VARCHAR(191) NULL,
    `hemorrhoids_note` VARCHAR(191) NULL,
    `bowel` VARCHAR(191) NULL,
    `mental_state` VARCHAR(191) NULL,
    `edema` JSON NULL,
    `other_special` TEXT NULL,
    `discharge_tips` TEXT NULL,
    `assessor_name` VARCHAR(191) NULL,
    `assessed_at` DATE NULL,
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 0,

    INDEX `care_mother_discharges_tenant_id_store_id_idx`(`tenant_id`, `store_id`),
    UNIQUE INDEX `care_mother_discharges_mother_profile_id_key`(`mother_profile_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `care_baby_discharges` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NOT NULL,
    `baby_profile_id` VARCHAR(191) NOT NULL,
    `document_id` VARCHAR(191) NULL,
    `age_days` INTEGER NULL,
    `admission_date` DATE NULL,
    `discharge_date` DATE NULL,
    `temperature` DOUBLE NULL,
    `respiration` INTEGER NULL,
    `admission_length_cm` DOUBLE NULL,
    `discharge_length_cm` DOUBLE NULL,
    `admission_weight_kg` DOUBLE NULL,
    `discharge_weight_kg` DOUBLE NULL,
    `admission_head_cm` DOUBLE NULL,
    `discharge_head_cm` DOUBLE NULL,
    `admission_jaundice_forehead` DOUBLE NULL,
    `admission_jaundice_canthus` DOUBLE NULL,
    `admission_jaundice_chest` DOUBLE NULL,
    `discharge_jaundice_forehead` DOUBLE NULL,
    `discharge_jaundice_canthus` DOUBLE NULL,
    `discharge_jaundice_chest` DOUBLE NULL,
    `rash` VARCHAR(191) NULL,
    `red_buttocks` VARCHAR(191) NULL,
    `head_finding` VARCHAR(191) NULL,
    `face` VARCHAR(191) NULL,
    `sclera` VARCHAR(191) NULL,
    `eye_secretion` VARCHAR(191) NULL,
    `ear` VARCHAR(191) NULL,
    `ear_note` VARCHAR(191) NULL,
    `oral_cavity` VARCHAR(191) NULL,
    `mucosa` VARCHAR(191) NULL,
    `throat` VARCHAR(191) NULL,
    `tongue` VARCHAR(191) NULL,
    `neck` VARCHAR(191) NULL,
    `feeding_method` VARCHAR(191) NULL,
    `breast_red_swollen` VARCHAR(191) NULL,
    `umbilical` JSON NULL,
    `umbilical_note` VARCHAR(191) NULL,
    `testis` VARCHAR(191) NULL,
    `male_findings` JSON NULL,
    `labia_development` VARCHAR(191) NULL,
    `vaginal_discharge` VARCHAR(191) NULL,
    `urethra_opening` VARCHAR(191) NULL,
    `other_malformation` VARCHAR(191) NULL,
    `anus` VARCHAR(191) NULL,
    `anus_note` VARCHAR(191) NULL,
    `spine_limbs` VARCHAR(191) NULL,
    `spine_limbs_note` VARCHAR(191) NULL,
    `discharge_tips` TEXT NULL,
    `assessor_name` VARCHAR(191) NULL,
    `client_signer_name` VARCHAR(191) NULL,
    `assessed_at` DATE NULL,
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 0,

    INDEX `care_baby_discharges_tenant_id_store_id_idx`(`tenant_id`, `store_id`),
    UNIQUE INDEX `care_baby_discharges_baby_profile_id_key`(`baby_profile_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `care_documents` ADD CONSTRAINT `care_documents_mother_profile_id_fkey` FOREIGN KEY (`mother_profile_id`) REFERENCES `mother_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `care_documents` ADD CONSTRAINT `care_documents_baby_profile_id_fkey` FOREIGN KEY (`baby_profile_id`) REFERENCES `baby_profiles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `care_document_files` ADD CONSTRAINT `care_document_files_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `care_documents`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `care_mother_admissions` ADD CONSTRAINT `care_mother_admissions_mother_profile_id_fkey` FOREIGN KEY (`mother_profile_id`) REFERENCES `mother_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `care_mother_admissions` ADD CONSTRAINT `care_mother_admissions_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `care_documents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `care_baby_admissions` ADD CONSTRAINT `care_baby_admissions_baby_profile_id_fkey` FOREIGN KEY (`baby_profile_id`) REFERENCES `baby_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `care_baby_admissions` ADD CONSTRAINT `care_baby_admissions_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `care_documents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `care_mother_discharges` ADD CONSTRAINT `care_mother_discharges_mother_profile_id_fkey` FOREIGN KEY (`mother_profile_id`) REFERENCES `mother_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `care_mother_discharges` ADD CONSTRAINT `care_mother_discharges_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `care_documents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `care_baby_discharges` ADD CONSTRAINT `care_baby_discharges_baby_profile_id_fkey` FOREIGN KEY (`baby_profile_id`) REFERENCES `baby_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `care_baby_discharges` ADD CONSTRAINT `care_baby_discharges_document_id_fkey` FOREIGN KEY (`document_id`) REFERENCES `care_documents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

