-- CreateTable
CREATE TABLE `personal_task` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `account_id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `note` VARCHAR(500) NULL,
    `quadrant` ENUM('Q1', 'Q2', 'Q3', 'Q4') NOT NULL DEFAULT 'Q2',
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `done` BOOLEAN NOT NULL DEFAULT false,
    `done_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `personal_task_tenant_id_account_id_done_idx`(`tenant_id`, `account_id`, `done`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `personal_reminder` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `account_id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `note` VARCHAR(500) NULL,
    `repeat` ENUM('NONE', 'DAILY', 'WEEKDAYS', 'WEEKLY', 'MONTHLY') NOT NULL DEFAULT 'NONE',
    `start_date` VARCHAR(10) NOT NULL,
    `time_of_day` VARCHAR(5) NULL,
    `weekday` INTEGER NULL,
    `month_day` INTEGER NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `personal_reminder_tenant_id_account_id_active_idx`(`tenant_id`, `account_id`, `active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `personal_reminder_done` (
    `id` VARCHAR(191) NOT NULL,
    `reminder_id` VARCHAR(191) NOT NULL,
    `date` VARCHAR(10) NOT NULL,
    `done_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `personal_reminder_done_reminder_id_date_key`(`reminder_id`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ongoing_work` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `account_id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `note` VARCHAR(500) NULL,
    `finished` BOOLEAN NOT NULL DEFAULT false,
    `finished_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `ongoing_work_tenant_id_account_id_finished_idx`(`tenant_id`, `account_id`, `finished`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ongoing_work_step` (
    `id` VARCHAR(191) NOT NULL,
    `work_id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `result` VARCHAR(500) NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `done` BOOLEAN NOT NULL DEFAULT false,
    `done_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ongoing_work_step_work_id_idx`(`work_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `quick_link` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `account_id` VARCHAR(191) NOT NULL,
    `path` VARCHAR(200) NOT NULL,
    `label` VARCHAR(60) NOT NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `quick_link_account_id_path_key`(`account_id`, `path`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `personal_reminder_done` ADD CONSTRAINT `personal_reminder_done_reminder_id_fkey` FOREIGN KEY (`reminder_id`) REFERENCES `personal_reminder`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ongoing_work_step` ADD CONSTRAINT `ongoing_work_step_work_id_fkey` FOREIGN KEY (`work_id`) REFERENCES `ongoing_work`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

