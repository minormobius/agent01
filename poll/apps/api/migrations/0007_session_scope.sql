-- Store granted OAuth scope in sessions (for minimal-permission login)
ALTER TABLE sessions ADD COLUMN oauth_scope TEXT;
