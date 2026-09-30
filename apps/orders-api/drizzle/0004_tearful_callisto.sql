ALTER TABLE `order_files` MODIFY COLUMN `uploaded_via` enum('sftp','web') NOT NULL DEFAULT 'sftp';--> statement-breakpoint
ALTER TABLE `orders` ADD `assigned_to` bigint;