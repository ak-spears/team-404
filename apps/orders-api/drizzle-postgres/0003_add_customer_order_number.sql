ALTER TABLE "orders" ADD COLUMN "customer_order_number" integer;--> statement-breakpoint
-- Backfill: number each signed-in customer's existing orders 1, 2, 3... oldest first. Guest
-- orders (customers.user_id IS NULL) stay null and keep showing their global id.
UPDATE "orders" AS o
SET "customer_order_number" = numbered.n
FROM (
  SELECT o2."id", ROW_NUMBER() OVER (PARTITION BY o2."customer_id" ORDER BY o2."id") AS n
  FROM "orders" AS o2
  JOIN "customers" AS c ON c."id" = o2."customer_id"
  WHERE c."user_id" IS NOT NULL
) AS numbered
WHERE o."id" = numbered."id";--> statement-breakpoint
CREATE UNIQUE INDEX "orders_customer_order_number_unique" ON "orders" USING btree ("customer_id","customer_order_number");
