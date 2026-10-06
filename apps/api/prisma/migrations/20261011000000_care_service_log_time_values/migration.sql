-- 服务执行记录：增加“做的时间”和测量类项目的数值（血压、体重）。只加列，不改动已有数据。
ALTER TABLE `care_service_logs`
    ADD COLUMN `done_time` VARCHAR(5) NULL,
    ADD COLUMN `systolic` INTEGER NULL,
    ADD COLUMN `diastolic` INTEGER NULL,
    ADD COLUMN `weight_kg` DECIMAL(5, 2) NULL;
