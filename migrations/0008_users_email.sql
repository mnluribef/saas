-- Migración 0008: Agregar columna email a tabla users para onboarding y comunicaciones
-- Ventrina SaaS

ALTER TABLE users ADD COLUMN email TEXT;
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
