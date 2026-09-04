/*
 * Login memperlakukan email dan username
 * secara case-insensitive.
 *
 * Database harus menerapkan aturan
 * uniqueness yang sama.
 */

CREATE UNIQUE INDEX
  "users_username_lower_key"
ON "users" (
  LOWER("username")
)
WHERE "username" IS NOT NULL;

CREATE UNIQUE INDEX
  "users_email_lower_key"
ON "users" (
  LOWER("email")
)
WHERE "email" IS NOT NULL;