-- 审批节点可以指定多位员工（或签/会签）
ALTER TABLE `workflow_nodes` ADD COLUMN `approver_account_ids` JSON NULL;
