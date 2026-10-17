-- 服务执行：测血压时同时登记心率
ALTER TABLE `care_service_logs` ADD COLUMN `heart_rate` INTEGER NULL;
