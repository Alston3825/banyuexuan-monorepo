-- 手机号、员工工号是员工在系统中的主要识别方式，均不可重复；离职归档后工号可回收给新员工使用。
-- ① 账号手机号在租户内唯一（手机号为空的账号不受影响）
-- ② 员工工号唯一性改建在“占用中的工号”active_employee_no 上：在册员工 = 工号；归档后置空 = 释放。
--    原来直接建在 employee_no 上的唯一索引去掉（否则归档员工的旧工号永远占着）。

ALTER TABLE `employee_profiles` ADD COLUMN `active_employee_no` VARCHAR(191) NULL,
    ADD COLUMN `archived_at` DATETIME(3) NULL;

-- 现有员工档案全部是在册状态：占用中的工号 = 现有工号
UPDATE `employee_profiles` SET `active_employee_no` = `employee_no`;

CREATE UNIQUE INDEX `employee_profiles_tenant_id_active_employee_no_key` ON `employee_profiles`(`tenant_id`, `active_employee_no`);
CREATE INDEX `employee_profiles_tenant_id_employee_no_idx` ON `employee_profiles`(`tenant_id`, `employee_no`);
DROP INDEX `employee_profiles_tenant_id_employee_no_key` ON `employee_profiles`;

CREATE UNIQUE INDEX `accounts_tenant_id_phone_key` ON `accounts`(`tenant_id`, `phone`);
