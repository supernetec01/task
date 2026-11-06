-- Add login names without deleting users or changing any password hashes.
ALTER TABLE users ADD COLUMN username text;
UPDATE users SET username=lower(email);
-- Preserve the existing unambiguous admin account, including its password.
UPDATE users SET username='admin'
WHERE lower(split_part(email,'@',1))='admin'
AND EXISTS(SELECT 1 FROM grants g WHERE g.user_id=users.id AND g.role='ADMIN' AND g.revoked_at IS NULL)
AND (SELECT count(*) FROM users u WHERE lower(split_part(u.email,'@',1))='admin'
     AND EXISTS(SELECT 1 FROM grants g WHERE g.user_id=u.id AND g.role='ADMIN' AND g.revoked_at IS NULL))=1;
ALTER TABLE users ALTER COLUMN username SET NOT NULL;
ALTER TABLE users ADD CONSTRAINT username_not_blank CHECK(length(trim(username)) BETWEEN 3 AND 254);
CREATE UNIQUE INDEX users_username_ci ON users(lower(username));
CREATE UNIQUE INDEX users_email_ci ON users(lower(email)) WHERE email IS NOT NULL;
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
