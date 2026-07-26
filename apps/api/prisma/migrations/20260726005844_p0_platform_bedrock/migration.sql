-- CreateTable
CREATE TABLE `tenants` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `status` ENUM('ACTIVE', 'SUSPENDED') NOT NULL DEFAULT 'ACTIVE',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `tenants_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `regions` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 0,

    INDEX `regions_tenant_id_idx`(`tenant_id`),
    UNIQUE INDEX `regions_tenant_id_code_key`(`tenant_id`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `stores` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `region_id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `address` VARCHAR(191) NULL,
    `status` ENUM('PENDING', 'ACTIVE', 'CLOSED') NOT NULL DEFAULT 'PENDING',
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 0,

    INDEX `stores_tenant_id_region_id_idx`(`tenant_id`, `region_id`),
    UNIQUE INDEX `stores_tenant_id_code_key`(`tenant_id`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `departments` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NULL,
    `parent_id` VARCHAR(191) NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 0,

    INDEX `departments_tenant_id_store_id_idx`(`tenant_id`, `store_id`),
    UNIQUE INDEX `departments_tenant_id_code_key`(`tenant_id`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `teams` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NULL,
    `department_id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 0,

    INDEX `teams_tenant_id_store_id_idx`(`tenant_id`, `store_id`),
    UNIQUE INDEX `teams_department_id_code_key`(`department_id`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `positions` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `rank` INTEGER NULL,
    `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `positions_tenant_id_code_key`(`tenant_id`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `accounts` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NULL,
    `department_id` VARCHAR(191) NULL,
    `team_id` VARCHAR(191) NULL,
    `position_id` VARCHAR(191) NULL,
    `username` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `password_hash` VARCHAR(191) NOT NULL,
    `real_name` VARCHAR(191) NOT NULL,
    `status` ENUM('ACTIVE', 'DISABLED', 'LOCKED') NOT NULL DEFAULT 'ACTIVE',
    `last_login_at` DATETIME(3) NULL,
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 0,

    INDEX `accounts_tenant_id_store_id_idx`(`tenant_id`, `store_id`),
    UNIQUE INDEX `accounts_tenant_id_username_key`(`tenant_id`, `username`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `roles` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `is_system` BOOLEAN NOT NULL DEFAULT false,
    `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `roles_tenant_id_code_key`(`tenant_id`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `permission_points` (
    `id` VARCHAR(191) NOT NULL,
    `application_id` VARCHAR(191) NULL,
    `parent_id` VARCHAR(191) NULL,
    `type` ENUM('MODULE', 'PAGE', 'BUTTON', 'FIELD') NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `is_sensitive` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `permission_points_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `role_permissions` (
    `id` VARCHAR(191) NOT NULL,
    `role_id` VARCHAR(191) NOT NULL,
    `permission_point_id` VARCHAR(191) NOT NULL,
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `role_permissions_role_id_permission_point_id_key`(`role_id`, `permission_point_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `account_role_assignments` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `account_id` VARCHAR(191) NOT NULL,
    `role_id` VARCHAR(191) NOT NULL,
    `scope_type` ENUM('TENANT', 'REGION', 'STORE', 'DEPARTMENT', 'TEAM', 'SELF') NOT NULL,
    `scope_id` VARCHAR(191) NULL,
    `granted_by` VARCHAR(191) NOT NULL,
    `granted_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expires_at` DATETIME(3) NULL,
    `revoked_at` DATETIME(3) NULL,

    INDEX `account_role_assignments_account_id_idx`(`account_id`),
    INDEX `account_role_assignments_tenant_id_scope_type_scope_id_idx`(`tenant_id`, `scope_type`, `scope_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `applications` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `type` ENUM('WEB', 'MOBILE', 'OPENAPI') NOT NULL,
    `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `applications_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tags` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `color` VARCHAR(191) NULL,
    `category` VARCHAR(191) NULL,
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `tags_tenant_id_name_key`(`tenant_id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tag_bindings` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `tag_id` VARCHAR(191) NOT NULL,
    `entity_type` VARCHAR(191) NOT NULL,
    `entity_id` VARCHAR(191) NOT NULL,
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `tag_bindings_entity_type_entity_id_idx`(`entity_type`, `entity_id`),
    UNIQUE INDEX `tag_bindings_tag_id_entity_type_entity_id_key`(`tag_id`, `entity_type`, `entity_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `parameters` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NULL,
    `store_id` VARCHAR(191) NULL,
    `key` VARCHAR(191) NOT NULL,
    `value` TEXT NOT NULL,
    `value_type` ENUM('STRING', 'NUMBER', 'BOOLEAN', 'JSON') NOT NULL DEFAULT 'STRING',
    `description` VARCHAR(191) NULL,
    `is_system` BOOLEAN NOT NULL DEFAULT false,
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `parameters_tenant_id_store_id_key_key`(`tenant_id`, `store_id`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NULL,
    `store_id` VARCHAR(191) NULL,
    `account_id` VARCHAR(191) NULL,
    `action` ENUM('LOGIN', 'LOGIN_FAILED', 'LOGOUT', 'CREATE', 'UPDATE', 'DELETE', 'VOID', 'STATE_TRANSITION', 'APPROVE', 'REJECT', 'WITHDRAW', 'REASSIGN', 'ADD_APPROVER', 'CC', 'ARCHIVE', 'SENSITIVE_QUERY', 'EXPORT', 'PRINT') NOT NULL,
    `entity_type` VARCHAR(191) NOT NULL,
    `entity_id` VARCHAR(191) NULL,
    `before_data` JSON NULL,
    `after_data` JSON NULL,
    `changed_fields` JSON NULL,
    `ip` VARCHAR(191) NULL,
    `user_agent` VARCHAR(191) NULL,
    `request_id` VARCHAR(191) NULL,
    `result` VARCHAR(191) NOT NULL DEFAULT 'SUCCESS',
    `remark` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_logs_tenant_id_created_at_idx`(`tenant_id`, `created_at`),
    INDEX `audit_logs_entity_type_entity_id_idx`(`entity_type`, `entity_id`),
    INDEX `audit_logs_account_id_created_at_idx`(`account_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `workflow_definitions` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `status` ENUM('DRAFT', 'PUBLISHED', 'DISABLED') NOT NULL DEFAULT 'PUBLISHED',
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `workflow_definitions_tenant_id_code_version_key`(`tenant_id`, `code`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `workflow_nodes` (
    `id` VARCHAR(191) NOT NULL,
    `workflow_definition_id` VARCHAR(191) NOT NULL,
    `seq` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `approver_type` ENUM('ROLE', 'ACCOUNT') NOT NULL,
    `approver_role_id` VARCHAR(191) NULL,
    `approver_account_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `workflow_nodes_workflow_definition_id_seq_key`(`workflow_definition_id`, `seq`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `workflow_instances` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NULL,
    `workflow_definition_id` VARCHAR(191) NOT NULL,
    `business_type` VARCHAR(191) NOT NULL,
    `business_id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `status` ENUM('DRAFT', 'SUBMITTED', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `current_node_seq` INTEGER NULL,
    `initiator_id` VARCHAR(191) NOT NULL,
    `submitted_at` DATETIME(3) NULL,
    `finished_at` DATETIME(3) NULL,
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 0,

    INDEX `workflow_instances_tenant_id_business_type_business_id_idx`(`tenant_id`, `business_type`, `business_id`),
    INDEX `workflow_instances_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `workflow_instance_approvers` (
    `id` VARCHAR(191) NOT NULL,
    `workflow_instance_id` VARCHAR(191) NOT NULL,
    `node_seq` INTEGER NOT NULL,
    `account_id` VARCHAR(191) NOT NULL,
    `role` ENUM('APPROVER', 'ADDED_APPROVER', 'CC') NOT NULL DEFAULT 'APPROVER',
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'REASSIGNED', 'SKIPPED', 'NOTIFIED') NOT NULL DEFAULT 'PENDING',
    `comment` TEXT NULL,
    `acted_at` DATETIME(3) NULL,
    `reassigned_from_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `workflow_instance_approvers_workflow_instance_id_node_seq_idx`(`workflow_instance_id`, `node_seq`),
    INDEX `workflow_instance_approvers_account_id_status_idx`(`account_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `workflow_action_logs` (
    `id` VARCHAR(191) NOT NULL,
    `workflow_instance_id` VARCHAR(191) NOT NULL,
    `node_seq` INTEGER NULL,
    `actor_id` VARCHAR(191) NOT NULL,
    `action` ENUM('SUBMIT', 'APPROVE', 'REJECT', 'WITHDRAW', 'REASSIGN', 'ADD_APPROVER', 'CC', 'ARCHIVE') NOT NULL,
    `comment` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `workflow_action_logs_workflow_instance_id_created_at_idx`(`workflow_instance_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `refresh_tokens` (
    `id` VARCHAR(191) NOT NULL,
    `account_id` VARCHAR(191) NOT NULL,
    `token_hash` VARCHAR(191) NOT NULL,
    `user_agent` VARCHAR(191) NULL,
    `ip` VARCHAR(191) NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `revoked_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `refresh_tokens_token_hash_key`(`token_hash`),
    INDEX `refresh_tokens_account_id_idx`(`account_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `demo_approval_requests` (
    `id` VARCHAR(191) NOT NULL,
    `tenant_id` VARCHAR(191) NOT NULL,
    `store_id` VARCHAR(191) NULL,
    `title` VARCHAR(191) NOT NULL,
    `content` TEXT NOT NULL,
    `amount` INTEGER NULL,
    `applicant_id` VARCHAR(191) NOT NULL,
    `status` ENUM('DRAFT', 'SUBMITTED', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `created_by` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `stores` ADD CONSTRAINT `stores_region_id_fkey` FOREIGN KEY (`region_id`) REFERENCES `regions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `departments` ADD CONSTRAINT `departments_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `departments` ADD CONSTRAINT `departments_parent_id_fkey` FOREIGN KEY (`parent_id`) REFERENCES `departments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `teams` ADD CONSTRAINT `teams_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `teams` ADD CONSTRAINT `teams_department_id_fkey` FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `accounts` ADD CONSTRAINT `accounts_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `accounts` ADD CONSTRAINT `accounts_department_id_fkey` FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `accounts` ADD CONSTRAINT `accounts_team_id_fkey` FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `accounts` ADD CONSTRAINT `accounts_position_id_fkey` FOREIGN KEY (`position_id`) REFERENCES `positions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `permission_points` ADD CONSTRAINT `permission_points_application_id_fkey` FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `permission_points` ADD CONSTRAINT `permission_points_parent_id_fkey` FOREIGN KEY (`parent_id`) REFERENCES `permission_points`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_permission_point_id_fkey` FOREIGN KEY (`permission_point_id`) REFERENCES `permission_points`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `account_role_assignments` ADD CONSTRAINT `account_role_assignments_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `account_role_assignments` ADD CONSTRAINT `account_role_assignments_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tag_bindings` ADD CONSTRAINT `tag_bindings_tag_id_fkey` FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workflow_nodes` ADD CONSTRAINT `workflow_nodes_workflow_definition_id_fkey` FOREIGN KEY (`workflow_definition_id`) REFERENCES `workflow_definitions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workflow_instances` ADD CONSTRAINT `workflow_instances_workflow_definition_id_fkey` FOREIGN KEY (`workflow_definition_id`) REFERENCES `workflow_definitions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workflow_instance_approvers` ADD CONSTRAINT `workflow_instance_approvers_workflow_instance_id_fkey` FOREIGN KEY (`workflow_instance_id`) REFERENCES `workflow_instances`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workflow_action_logs` ADD CONSTRAINT `workflow_action_logs_workflow_instance_id_fkey` FOREIGN KEY (`workflow_instance_id`) REFERENCES `workflow_instances`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `refresh_tokens` ADD CONSTRAINT `refresh_tokens_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
