-- AlterTable
ALTER TABLE `leads` ADD COLUMN `appointment_note` TEXT NULL,
    ADD COLUMN `appointment_time` DATETIME(3) NULL,
    ADD COLUMN `appointment_type` ENUM('VISIT', 'TRIAL_MEAL') NULL,
    ADD COLUMN `handle_remark` TEXT NULL,
    ADD COLUMN `process_results` JSON NULL,
    ADD COLUMN `processed` BOOLEAN NOT NULL DEFAULT false;
