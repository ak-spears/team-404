CREATE TABLE `google_identities` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`user_id` bigint NOT NULL,
	`google_id` varchar(255) NOT NULL,
	`email` varchar(255) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `google_identities_id` PRIMARY KEY(`id`),
	CONSTRAINT `google_identities_user_id_unique` UNIQUE(`user_id`),
	CONSTRAINT `google_identities_google_id_unique` UNIQUE(`google_id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `password_hash` varchar(255);--> statement-breakpoint
ALTER TABLE `google_identities` ADD CONSTRAINT `google_identities_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;