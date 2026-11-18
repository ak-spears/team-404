ALTER TABLE `users` MODIFY COLUMN `role` ENUM('customer', 'staff', 'admin') NOT NULL;
ALTER TABLE `users` ADD COLUMN `stripe_customer_id` varchar(255);
