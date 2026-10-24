-- Migration 0014: Auditoría de soft-delete en tenants (Fix #13)
ALTER TABLE tenants ADD COLUMN deleted_at DATETIME;
