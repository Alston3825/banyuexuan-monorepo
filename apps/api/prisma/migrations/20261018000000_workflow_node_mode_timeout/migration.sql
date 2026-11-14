-- AlterTable
ALTER TABLE `workflow_action_logs` MODIFY `action` ENUM('SUBMIT', 'APPROVE', 'REJECT', 'WITHDRAW', 'REASSIGN', 'ADD_APPROVER', 'CC', 'ARCHIVE', 'URGE') NOT NULL;

-- AlterTable
ALTER TABLE `workflow_nodes` ADD COLUMN `approval_mode` ENUM('ALL', 'ANY') NOT NULL DEFAULT 'ALL',
    ADD COLUMN `timeout_hours` INTEGER NULL;

