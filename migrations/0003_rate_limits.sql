-- Migración 0003: Rate Limiting
-- Añadir tabla persistente para el control de intentos de login por IP

CREATE TABLE IF NOT EXISTS rate_limits (
    ip TEXT PRIMARY KEY,
    count INTEGER NOT NULL DEFAULT 1,
    first_attempt INTEGER NOT NULL,
    lockout_until INTEGER NOT NULL DEFAULT 0
);
