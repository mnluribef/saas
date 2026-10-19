-- Migration 0010: F-02 & S-03
-- 1. F-02: Persistencia de cupón y descuento aplicado en pedidos
ALTER TABLE orders ADD COLUMN coupon_code TEXT;
ALTER TABLE orders ADD COLUMN discount_amount REAL DEFAULT 0.0;

-- 2. S-03: Almacenamiento de IP y hash de User-Agent en sesiones para mitigar session hijacking
ALTER TABLE sessions ADD COLUMN ip TEXT;
ALTER TABLE sessions ADD COLUMN ua_hash TEXT;
