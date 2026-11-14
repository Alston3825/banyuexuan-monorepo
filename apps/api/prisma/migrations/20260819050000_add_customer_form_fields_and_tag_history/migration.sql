-- 手写迁移：`prisma migrate dev`的shadow database diff在这台机器上会因为一个跟本次
-- 改动无关的历史遗留问题（knowledge_chunks外键在shadow db重放时报重复）失败，
-- migrate deploy不做diff、不受影响，所以改成手写这份迁移内容，跳过有问题的
-- 自动生成部分。内容对应 schema.prisma 里 Customer 新增字段 + TagBinding.revokedAt。

-- DropForeignKey
ALTER TABLE `tag_bindings` DROP FOREIGN KEY `tag_bindings_tag_id_fkey`;

-- DropIndex
DROP INDEX `tag_bindings_tag_id_entity_type_entity_id_key` ON `tag_bindings`;

-- AlterTable
ALTER TABLE `customers` ADD COLUMN `address` TEXT NULL,
    ADD COLUMN `expected_due_date` DATETIME(3) NULL,
    ADD COLUMN `hospital` VARCHAR(191) NULL,
    ADD COLUMN `region` VARCHAR(191) NULL,
    ADD COLUMN `service_types` JSON NULL,
    ADD COLUMN `wechat` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `tag_bindings` ADD COLUMN `revoked_at` DATETIME(3) NULL;

-- CreateIndex
CREATE INDEX `tag_bindings_tag_id_entity_type_entity_id_revoked_at_idx` ON `tag_bindings`(`tag_id`, `entity_type`, `entity_id`, `revoked_at`);

-- AddForeignKey
ALTER TABLE `tag_bindings` ADD CONSTRAINT `tag_bindings_tag_id_fkey` FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
