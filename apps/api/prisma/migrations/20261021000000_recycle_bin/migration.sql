-- 回收站：删除客户/母婴档案前存快照，保留30天可还原
CREATE TABLE `recycle_bin_items` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `entity_type` VARCHAR(191) NOT NULL,
    `entity_id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `summary` TEXT NULL,
    `payload` LONGTEXT NOT NULL,
    `file_doc_ids` JSON NULL,
    `reason` VARCHAR(191) NULL,
    `deleted_by` VARCHAR(191) NOT NULL,
    `deleted_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expires_at` DATETIME(3) NOT NULL,

    INDEX `recycle_bin_items_tenant_id_entity_type_expires_at_idx`(`tenant_id`, `entity_type`, `expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
