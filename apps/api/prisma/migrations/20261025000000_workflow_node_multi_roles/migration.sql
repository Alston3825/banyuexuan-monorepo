-- 审批节点可以指定多个角色
ALTER TABLE `workflow_nodes` ADD COLUMN `approver_role_ids` JSON NULL;
