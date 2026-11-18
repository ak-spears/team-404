ALTER TYPE "user_role" ADD VALUE IF NOT EXISTS 'admin';
ALTER TABLE "users" ADD COLUMN "stripe_customer_id" varchar(255);
