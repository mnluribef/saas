-- Migration 0016: Columna opcional client_email en orders para notificaciones automáticas (Fix #18)
ALTER TABLE orders ADD COLUMN client_email TEXT;
