-- users.cwid is declared in src/db/schema.ts (Google sign-in stores a Campus-Wide ID for
-- non-UA accounts) but no migration ever created it: the migrations that would have were
-- generated on the Auth0 branch, then removed while their snapshots were left behind, which
-- also hid the gap from `drizzle-kit generate`. Any database built from this folder was
-- missing the column, and every password login 503'd -- db.select().from(users) selects it.
--
-- Guarded rather than a plain ALTER: databases that predate this (a VM whose schema was
-- fixed by hand) may already have the column, and MySQL 8 has no ADD COLUMN IF NOT EXISTS.
SET @cwid_exists := (
	SELECT COUNT(*) FROM information_schema.COLUMNS
	WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'cwid'
);
--> statement-breakpoint
SET @cwid_ddl := IF(@cwid_exists = 0, 'ALTER TABLE `users` ADD COLUMN `cwid` varchar(32)', 'DO 0');
--> statement-breakpoint
PREPARE add_cwid FROM @cwid_ddl;
--> statement-breakpoint
EXECUTE add_cwid;
--> statement-breakpoint
DEALLOCATE PREPARE add_cwid;
