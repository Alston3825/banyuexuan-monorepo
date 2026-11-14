ALTER TABLE `purchase_orders`
  ADD COLUMN `platform` VARCHAR(20) NULL,
  ADD COLUMN `platform_order_no` VARCHAR(64) NULL,
  ADD COLUMN `express_company` VARCHAR(40) NULL,
  ADD COLUMN `express_phone_tail` VARCHAR(8) NULL,
  ADD COLUMN `logistics_state` INTEGER NULL,
  ADD COLUMN `logistics_trace` JSON NULL,
  ADD COLUMN `logistics_checked_at` DATETIME(3) NULL,
  ADD COLUMN `logistics_error` VARCHAR(255) NULL;
