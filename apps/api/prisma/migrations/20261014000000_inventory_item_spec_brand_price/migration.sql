-- 物品增加规格/型号、品牌、参考单价（对应采购申购表里的列），支持 Excel 导入。只加列，不改动已有数据。
ALTER TABLE `inventory_items` ADD COLUMN `brand` VARCHAR(100) NULL,
    ADD COLUMN `reference_price` DECIMAL(12, 4) NULL,
    ADD COLUMN `spec` VARCHAR(200) NULL;
