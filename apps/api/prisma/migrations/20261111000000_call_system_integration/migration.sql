
-- AlterTable
ALTER TABLE `customers` ADD COLUMN `salutation` VARCHAR(32) NULL;

-- AlterTable
ALTER TABLE `employee_profiles` ADD COLUMN `duty_status` ENUM('ON_DUTY', 'OFF_DUTY', 'RESTING') NOT NULL DEFAULT 'OFF_DUTY',
    ADD COLUMN `responsible_floors` JSON NULL,
    ADD COLUMN `watch_id` VARCHAR(64) NULL;

-- CreateTable
CREATE TABLE `integration_systems` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(64) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `base_url` VARCHAR(191) NULL,
    `system_version` VARCHAR(32) NULL,
    `store_id` VARCHAR(191) NULL,
    `api_key_hash` VARCHAR(64) NOT NULL,
    `api_key_prefix` VARCHAR(16) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `last_seen_at` DATETIME(3) NULL,
    `remark` TEXT NULL,
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `integration_systems_api_key_hash_key`(`api_key_hash`),
    UNIQUE INDEX `integration_systems_tenant_id_code_key`(`tenant_id`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `room_device_bindings` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NOT NULL,
    `room_id` VARCHAR(191) NOT NULL,
    `kind` ENUM('TABLET', 'BEACON') NOT NULL,
    `device_code` VARCHAR(64) NOT NULL,
    `remark` VARCHAR(191) NULL,
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `room_device_bindings_tenant_id_room_id_idx`(`tenant_id`, `room_id`),
    UNIQUE INDEX `room_device_bindings_tenant_id_store_id_kind_device_code_key`(`tenant_id`, `store_id`, `kind`, `device_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `service_catalog_items` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `service_code` VARCHAR(64) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `category` VARCHAR(32) NOT NULL DEFAULT 'CALL',
    `sort_no` INTEGER NOT NULL DEFAULT 1,
    `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `service_catalog_items_tenant_id_service_code_key`(`tenant_id`, `service_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `external_call_records` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NOT NULL,
    `source` VARCHAR(64) NOT NULL,
    `call_id` VARCHAR(64) NOT NULL,
    `room_id` VARCHAR(191) NULL,
    `stay_id` VARCHAR(191) NULL,
    `request_type` VARCHAR(64) NOT NULL,
    `service_code` VARCHAR(64) NULL,
    `status` VARCHAR(32) NOT NULL DEFAULT 'CREATED',
    `initiated_at` DATETIME(3) NOT NULL,
    `dispatched_at` DATETIME(3) NULL,
    `accepted_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `handler_staff_id` VARCHAR(191) NULL,
    `feedback` TEXT NULL,
    `payload` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `external_call_records_tenant_id_store_id_initiated_at_idx`(`tenant_id`, `store_id`, `initiated_at`),
    INDEX `external_call_records_tenant_id_stay_id_idx`(`tenant_id`, `stay_id`),
    INDEX `external_call_records_tenant_id_room_id_idx`(`tenant_id`, `room_id`),
    UNIQUE INDEX `external_call_records_tenant_id_source_call_id_key`(`tenant_id`, `source`, `call_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `integration_events` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NOT NULL,
    `event_type` VARCHAR(64) NOT NULL,
    `entity_id` VARCHAR(191) NULL,
    `payload` JSON NOT NULL,
    `seq` BIGINT NOT NULL AUTO_INCREMENT,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `integration_events_seq_key`(`seq`),
    INDEX `integration_events_tenant_id_store_id_seq_idx`(`tenant_id`, `store_id`, `seq`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `room_device_bindings` ADD CONSTRAINT `room_device_bindings_room_id_fkey` FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

