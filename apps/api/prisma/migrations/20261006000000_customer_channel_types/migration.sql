-- 渠道类型改成可自定义：新增 customer_channel_types，客户/具体渠道改为指向它。
-- 已有数据按旧枚举（source / source_type）回填到 6 个内置类型，不丢信息。

-- CreateTable
CREATE TABLE `customer_channel_types` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `legacy_source` ENUM('WALK_IN', 'REFERRAL', 'ONLINE_AD', 'SOCIAL_MEDIA', 'PARTNER', 'OTHER') NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `customer_channel_types_tenant_id_name_key`(`tenant_id`, `name`),
    UNIQUE INDEX `customer_channel_types_tenant_id_legacy_source_key`(`tenant_id`, `legacy_source`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 每个租户插入 6 个内置类型
INSERT INTO `customer_channel_types` (`id`, `tenant_id`, `name`, `legacy_source`, `sort_order`, `status`, `created_by`, `updated_at`)
SELECT UUID(), t.`id`, v.`name`, v.`legacy_source`, v.`sort_order`, 'ACTIVE', 'system', CURRENT_TIMESTAMP(3)
FROM `tenants` t
CROSS JOIN (
    SELECT '自然到店' AS `name`, 'WALK_IN' AS `legacy_source`, 1 AS `sort_order`
    UNION ALL SELECT '转介绍', 'REFERRAL', 2
    UNION ALL SELECT '线上广告', 'ONLINE_AD', 3
    UNION ALL SELECT '社交媒体/私域', 'SOCIAL_MEDIA', 4
    UNION ALL SELECT '渠道合作', 'PARTNER', 5
    UNION ALL SELECT '其他', 'OTHER', 6
) v;

-- 客户：新增渠道类型列并按旧 source 回填
ALTER TABLE `customers` ADD COLUMN `channel_type_id` VARCHAR(191) NULL;

UPDATE `customers` c
JOIN `customer_channel_types` ct ON ct.`tenant_id` = c.`tenant_id` AND ct.`legacy_source` = c.`source`
SET c.`channel_type_id` = ct.`id`;

-- 具体渠道：source_type -> type_id
ALTER TABLE `customer_channels` ADD COLUMN `type_id` VARCHAR(191) NULL;

UPDATE `customer_channels` ch
JOIN `customer_channel_types` ct ON ct.`tenant_id` = ch.`tenant_id` AND ct.`legacy_source` = ch.`source_type`
SET ch.`type_id` = ct.`id`;

DROP INDEX `customer_channels_tenant_id_source_type_name_key` ON `customer_channels`;

ALTER TABLE `customer_channels` DROP COLUMN `source_type`,
    MODIFY `type_id` VARCHAR(191) NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX `customer_channels_tenant_id_type_id_name_key` ON `customer_channels`(`tenant_id`, `type_id`, `name`);

-- CreateIndex
CREATE INDEX `customers_tenant_id_channel_type_id_idx` ON `customers`(`tenant_id`, `channel_type_id`);

-- AddForeignKey
ALTER TABLE `customers` ADD CONSTRAINT `customers_channel_type_id_fkey` FOREIGN KEY (`channel_type_id`) REFERENCES `customer_channel_types`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customer_channels` ADD CONSTRAINT `customer_channels_type_id_fkey` FOREIGN KEY (`type_id`) REFERENCES `customer_channel_types`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
