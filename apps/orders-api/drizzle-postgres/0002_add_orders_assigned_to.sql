-- Already applied by hand in production; IF NOT EXISTS keeps this a no-op there.
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "assigned_to" bigint;
