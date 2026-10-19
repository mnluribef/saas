-- Migration 0012: F-07
-- Búsqueda full-text optimizada de productos con FTS5 y disparadores de sincronización
CREATE VIRTUAL TABLE IF NOT EXISTS products_fts USING fts5(
    name,
    description,
    sku,
    brand,
    content='products',
    content_rowid='rowid'
);

CREATE TRIGGER IF NOT EXISTS trg_products_fts_ai AFTER INSERT ON products BEGIN
    INSERT INTO products_fts(rowid, name, description, sku, brand)
    VALUES (new.rowid, new.name, new.description, new.sku, new.brand);
END;

CREATE TRIGGER IF NOT EXISTS trg_products_fts_ad AFTER DELETE ON products BEGIN
    INSERT INTO products_fts(products_fts, rowid, name, description, sku, brand)
    VALUES ('delete', old.rowid, old.name, old.description, old.sku, old.brand);
END;

CREATE TRIGGER IF NOT EXISTS trg_products_fts_au AFTER UPDATE ON products BEGIN
    INSERT INTO products_fts(products_fts, rowid, name, description, sku, brand)
    VALUES ('delete', old.rowid, old.name, old.description, old.sku, old.brand);
    INSERT INTO products_fts(rowid, name, description, sku, brand)
    VALUES (new.rowid, new.name, new.description, new.sku, new.brand);
END;
