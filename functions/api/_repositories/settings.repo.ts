// functions/api/_repositories/settings.repo.ts
// Acceso a datos y consultas D1 para configuración por namespaces y tenant core (M-01)
import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types';
import type { TenantRow } from '../../types';

export interface SettingRow {
    key: string;
    value: string;
    tenant_id: string;
}

export interface TenantSettingsRow {
    id?: number;
    tenant_id: string;
    namespace: string;
    data_json: string;
    updated_at: string;
}

export class SettingsRepository {
    constructor(private db: D1Database) {}

    /**
     * Obtiene el registro principal del tenant
     */
    async getTenant(tenantId: string): Promise<TenantRow | null> {
        return await this.db.prepare(
            "SELECT * FROM tenants WHERE id = ? AND active = 1"
        ).bind(tenantId).first<TenantRow>();
    }

    /**
     * Obtiene todas las filas clave-valor de settings para un tenant
     */
    async getSettingsList(tenantId: string): Promise<SettingRow[]> {
        const { results } = await this.db.prepare(
            "SELECT key, value FROM settings WHERE tenant_id = ?"
        ).bind(tenantId).all<SettingRow>();
        return results || [];
    }

    /**
     * Obtiene los settings persistidos por namespace de la tabla tenant_settings
     */
    async getNamespaces(tenantId: string): Promise<TenantSettingsRow[]> {
        const { results } = await this.db.prepare(
            "SELECT namespace, data_json FROM tenant_settings WHERE tenant_id = ?"
        ).bind(tenantId).all<TenantSettingsRow>();
        return results || [];
    }

    /**
     * Obtiene un único namespace de configuración
     */
    async getNamespace(tenantId: string, namespace: string): Promise<TenantSettingsRow | null> {
        return await this.db.prepare(
            "SELECT namespace, data_json FROM tenant_settings WHERE tenant_id = ? AND namespace = ?"
        ).bind(tenantId, namespace).first<TenantSettingsRow>();
    }

    /**
     * Guarda la configuración consolidada y actualiza namespaces en una sola transacción atómica por lote
     */
    async saveSettingsBatch(
        tenantId: string,
        tenantUpdate: { name: string; template: string; whatsapp: string; configJson: string },
        namespaceUpdates: Array<{ namespace: string; dataJson: string }>,
        bcvUpdate?: { rate: string; autoUpdate: string }
    ): Promise<void> {
        const statements: D1PreparedStatement[] = [];

        // 1. Statements de namespaces en tenant_settings
        for (const ns of namespaceUpdates) {
            statements.push(
                this.db.prepare(`
                    INSERT INTO tenant_settings (tenant_id, namespace, data_json, updated_at)
                    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(tenant_id, namespace) DO UPDATE SET
                        data_json = excluded.data_json,
                        updated_at = CURRENT_TIMESTAMP
                `).bind(tenantId, ns.namespace, ns.dataJson)
            );
        }

        // 2. Statements de tasa BCV en settings si aplica
        if (bcvUpdate) {
            statements.push(
                this.db.prepare(`
                    INSERT INTO settings (key, value, tenant_id) VALUES ('bcv_rate', ?, ?)
                    ON CONFLICT(key, tenant_id) DO UPDATE SET value = excluded.value
                `).bind(bcvUpdate.rate, tenantId),
                this.db.prepare(`
                    INSERT INTO settings (key, value, tenant_id) VALUES ('bcv_auto_update', ?, ?)
                    ON CONFLICT(key, tenant_id) DO UPDATE SET value = excluded.value
                `).bind(bcvUpdate.autoUpdate, tenantId)
            );
        }

        // 3. Statement de actualización del registro del tenant
        statements.push(
            this.db.prepare(`
                UPDATE tenants 
                SET name = ?, template = ?, whatsapp = ?, config_json = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).bind(
                tenantUpdate.name, tenantUpdate.template, tenantUpdate.whatsapp,
                tenantUpdate.configJson, tenantId
            )
        );

        await this.db.batch(statements);
    }
}
