-- Already applied by hand in production; IF NOT EXISTS keeps this a no-op there.
ALTER TYPE "public"."upload_method" ADD VALUE IF NOT EXISTS 'web';
