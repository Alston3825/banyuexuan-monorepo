-- 工号规则：高新店工号以 1 开头，枣园店以 2 开头
ALTER TABLE `stores` ADD COLUMN `employee_no_prefix` VARCHAR(191) NULL;
UPDATE `stores` SET `employee_no_prefix` = '1' WHERE `name` LIKE '%高新%';
UPDATE `stores` SET `employee_no_prefix` = '2' WHERE `name` LIKE '%枣园%';
