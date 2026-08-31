CREATE TABLE `customers` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`user_id` bigint,
	`name` varchar(255) NOT NULL,
	`email` varchar(255) NOT NULL,
	`phone` varchar(32),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `customers_id` PRIMARY KEY(`id`),
	CONSTRAINT `customers_user_id_unique` UNIQUE(`user_id`)
);
--> statement-breakpoint
CREATE TABLE `order_events` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`order_id` bigint NOT NULL,
	`event_type` varchar(64) NOT NULL,
	`actor` enum('system','staff','customer') NOT NULL,
	`payload_json` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `order_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `order_files` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`order_id` bigint NOT NULL,
	`object_key` varchar(512) NOT NULL,
	`original_filename` varchar(255) NOT NULL,
	`size_bytes` bigint NOT NULL,
	`uploaded_via` enum('sftp') NOT NULL DEFAULT 'sftp',
	`uploaded_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `order_files_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `order_upload_credentials` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`order_id` bigint NOT NULL,
	`username` varchar(64) NOT NULL,
	`password_hash` varchar(255) NOT NULL,
	`expires_at` timestamp NOT NULL,
	`used_at` timestamp,
	CONSTRAINT `order_upload_credentials_id` PRIMARY KEY(`id`),
	CONSTRAINT `order_upload_credentials_order_id_unique` UNIQUE(`order_id`)
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`customer_id` bigint,
	`service_type` enum('poster','resume_portfolio','class_assignment','department_job','personal_printing') NOT NULL,
	`quantity` int NOT NULL DEFAULT 1,
	`spec_notes` text,
	`payment_method` enum('bama_cash','card','cash') NOT NULL,
	`price_cents` int,
	`status` enum('submitted','files_pending','files_received','in_production','ready_for_pickup','completed','cancelled') NOT NULL DEFAULT 'submitted',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`pickup_ready_at` timestamp,
	`completed_at` timestamp,
	CONSTRAINT `orders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`username` varchar(64) NOT NULL,
	`password_hash` varchar(255) NOT NULL,
	`role` enum('customer','staff') NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_username_unique` UNIQUE(`username`)
);
--> statement-breakpoint
ALTER TABLE `customers` ADD CONSTRAINT `customers_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_events` ADD CONSTRAINT `order_events_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_files` ADD CONSTRAINT `order_files_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `order_upload_credentials` ADD CONSTRAINT `order_upload_credentials_order_id_orders_id_fk` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `orders` ADD CONSTRAINT `orders_customer_id_customers_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE no action ON UPDATE no action;