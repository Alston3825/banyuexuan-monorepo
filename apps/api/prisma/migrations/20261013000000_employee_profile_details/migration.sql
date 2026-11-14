-- 员工档案补充员工信息表里的字段：合同类型、社保、身份证、性别/出生日期、工资卡、开户行、紧急联系人、住址、离职原因。
-- 只加列和一个唯一索引，不改动已有数据。
ALTER TABLE `employee_profiles` ADD COLUMN `address` VARCHAR(255) NULL,
    ADD COLUMN `bank_account_no` VARCHAR(32) NULL,
    ADD COLUMN `bank_name` VARCHAR(100) NULL,
    ADD COLUMN `birth_date` DATE NULL,
    ADD COLUMN `contract_type` ENUM('LABOR', 'PROBATION', 'SERVICE', 'OVERAGE', 'PENDING_SIGN') NULL,
    ADD COLUMN `emergency_contact_name` VARCHAR(191) NULL,
    ADD COLUMN `emergency_contact_phone` VARCHAR(191) NULL,
    ADD COLUMN `emergency_contact_relation` VARCHAR(191) NULL,
    ADD COLUMN `gender` ENUM('MALE', 'FEMALE') NULL,
    ADD COLUMN `id_card_no` VARCHAR(18) NULL,
    ADD COLUMN `social_insurance` ENUM('ENROLLED', 'NOT_ENROLLED') NULL,
    ADD COLUMN `termination_reason` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `employee_profiles_tenant_id_id_card_no_key` ON `employee_profiles`(`tenant_id`, `id_card_no`);
