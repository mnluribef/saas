-- Migration 0015: Eliminación de tabla redundante 'sales' (Fix #20)
-- La única fuente canónica de ventas e ingresos es la tabla 'orders' con status = 'completado'.
DROP TABLE IF EXISTS sales;
