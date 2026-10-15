-- Existing accounts can supervise without creating a person profile.
-- Additive schema only: no relationships, account IDs or permissions are seeded.
ALTER TABLE person_profiles ADD COLUMN supervisor_account_user_id text
  CONSTRAINT ck_people_single_supervisor CHECK (supervisor_account_user_id IS NULL OR supervisor_profile_id IS NULL);
--> statement-breakpoint
CREATE INDEX idx_people_supervisor_account ON person_profiles(owner_id,supervisor_account_user_id)
  WHERE supervisor_account_user_id IS NOT NULL;
