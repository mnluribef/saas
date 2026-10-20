// functions/api/_services/settings.service.ts
// Lógica de negocio para consolidación, validación y persistencia de configuración por namespaces (M-01)
import type { D1Database, KVNamespace } from '@cloudflare/workers-types';
import { SettingsRepository } from '../_repositories/settings.repo';
import { invalidateTenantCache } from '../_tenant';
import { ok, type Result } from '../_result';
import type { StoreSettings } from '../settings';
import type { TenantRow } from '../../types';

export class SettingsService {
    private repo: SettingsRepository;

    constructor(db: D1Database) {
        this.repo = new SettingsRepository(db);
    }

    /**
     * Carga y reconstruye la configuración modular por namespace o global
     */
    async loadSettings(
        tenantId: string,
        fallbackJson?: string | null,
        namespace?: string | null
    ): Promise<Record<string, unknown>> {
        const namespaces = await this.repo.getNamespaces(tenantId);

        if (namespaces.length > 0) {
            const config: Record<string, unknown> = {};
            for (const row of namespaces) {
                if (namespace && row.namespace !== namespace) continue;
                try {
                    config[row.namespace] = JSON.parse(row.data_json);
                } catch {
                    config[row.namespace] = {};
                }
            }

            if (namespace) {
                return { [namespace]: config[namespace] || {} };
            }
            return config;
        }

        if (fallbackJson) {
            try {
                const parsed = JSON.parse(fallbackJson);
                if (namespace) {
                    return { [namespace]: parsed[namespace] || {} };
                }
                return parsed;
            } catch {
                return {};
            }
        }

        return {};
    }

    /**
     * Obtiene la respuesta de settings formateada para el controlador GET
     */
    async getTenantSettingsResponse(
        tenantId: string,
        tenantData: TenantRow | null,
        requestedNamespace?: string | null
    ): Promise<Result<Record<string, unknown>, string>> {
        let tenant = tenantData;
        if (!tenant) {
            tenant = await this.repo.getTenant(tenantId);
        }

        const configJson = await this.loadSettings(tenantId, tenant?.config_json, requestedNamespace);

        if (requestedNamespace && typeof requestedNamespace === "string") {
            return ok({
                success: true,
                tenantId,
                namespace: requestedNamespace,
                data: configJson[requestedNamespace] || {}
            });
        }

        return ok({
            success: true,
            tenant: {
                id: tenantId,
                name: tenant?.name || "Tienda",
                template: tenant?.template || "restaurant",
                domain: tenant?.domain || null,
                whatsapp: tenant?.whatsapp || null,
                config: configJson
            }
        });
    }

    /**
     * Guarda y consolida namespaces actualizando atómicamente tenant_settings y snapshot de tenants
     */
    async updateStoreSettings(
        tenantId: string,
        updates: StoreSettings,
        tenantDomain?: string | null,
        kv?: KVNamespace
    ): Promise<Result<{ message: string; config: Record<string, unknown> }, string>> {
        const tenantRow = await this.repo.getTenant(tenantId);
        const currentConfig = await this.loadSettings(tenantId, tenantRow?.config_json);

        // 1. Merge modular por cada Namespace
        const currentBusiness = (currentConfig.business || {}) as Record<string, unknown>;
        const mergedBusiness = {
            ...currentBusiness,
            ...(updates.business || {})
        };

        const currentContact = (currentConfig.contact || {}) as Record<string, unknown>;
        const mergedContact = {
            ...currentContact,
            ...(updates.contact || {})
        };

        const currentLanding = (currentConfig.landing || {}) as Record<string, unknown>;
        const updateLanding = updates.landing || {};
        const currentHero = (currentLanding.hero || {}) as Record<string, unknown>;
        const currentCatalog = (currentLanding.catalog || {}) as Record<string, unknown>;
        const currentBenefits = (currentLanding.benefits || {}) as Record<string, unknown>;
        const currentProcess = (currentLanding.process || {}) as Record<string, unknown>;
        const currentTestimonials = (currentLanding.testimonials || {}) as Record<string, unknown>;
        const currentFaq = (currentLanding.faq || {}) as Record<string, unknown>;

        const mergedLanding = {
            ...currentLanding,
            hero: {
                ...currentHero,
                ...(updateLanding.hero || {}),
                slides: updateLanding.hero?.slides !== undefined ? updateLanding.hero.slides : (currentHero.slides || []),
                stats: updateLanding.hero?.stats !== undefined ? updateLanding.hero.stats : (currentHero.stats || []),
            },
            catalog: {
                ...currentCatalog,
                ...(updateLanding.catalog || {})
            },
            benefits: {
                ...currentBenefits,
                ...(updateLanding.benefits || {}),
                items: updateLanding.benefits?.items !== undefined ? updateLanding.benefits.items : (currentBenefits.items || []),
            },
            process: {
                ...currentProcess,
                ...(updateLanding.process || {}),
                steps: updateLanding.process?.steps !== undefined ? updateLanding.process.steps : (currentProcess.steps || []),
            },
            testimonials: {
                ...currentTestimonials,
                ...(updateLanding.testimonials || {}),
                items: updateLanding.testimonials?.items !== undefined ? updateLanding.testimonials.items : (currentTestimonials.items || []),
            },
            faq: {
                ...currentFaq,
                ...(updateLanding.faq || {}),
                items: updateLanding.faq?.items !== undefined ? updateLanding.faq.items : (currentFaq.items || []),
            },
        };

        const currentPayment = (currentConfig.payment || {}) as Record<string, unknown>;
        const currentPagoMovil = (currentPayment.pagoMovil || {}) as Record<string, unknown>;
        const currentZelle = (currentPayment.zelle || {}) as Record<string, unknown>;
        const currentPmAccounts = (currentPayment.pagoMovilAccounts || []) as Array<Record<string, unknown>>;

        let updatedPmAccounts = updates.payment && updates.payment.pagoMovilAccounts !== undefined
            ? updates.payment.pagoMovilAccounts
            : currentPmAccounts;

        // Si solo se actualizaron datos de pagoMovil tradicional y no hay pagoMovilAccounts, sincronizar la primera cuenta
        if ((!updatedPmAccounts || updatedPmAccounts.length === 0) && (updates.payment?.pagoMovil || currentPagoMovil)) {
            const pm = ((updates.payment && updates.payment.pagoMovil) || currentPagoMovil) as Record<string, unknown>;
            if (pm.banco || pm.telefono || pm.cedula) {
                updatedPmAccounts = [{
                    id: 'pm_1',
                    banco: pm.banco || '',
                    telefono: pm.telefono || '',
                    cedula: pm.cedula || '',
                    titular: pm.titular || '',
                    isDefault: true
                }];
            }
        }

        // Determinar cuenta principal para mantener compatibilidad 100% con payment.pagoMovil
        let primaryPm: Record<string, string> = {
            banco: String(currentPagoMovil.banco || ''),
            telefono: String(currentPagoMovil.telefono || ''),
            cedula: String(currentPagoMovil.cedula || ''),
            titular: String(currentPagoMovil.titular || ''),
            ...((updates.payment && updates.payment.pagoMovil) || {})
        };
        if (Array.isArray(updatedPmAccounts) && updatedPmAccounts.length > 0) {
            const def = (updatedPmAccounts.find(a => (a as any).isDefault) || updatedPmAccounts[0]) as any;
            if (def) {
                primaryPm = {
                    banco: String(def.banco || ''),
                    telefono: String(def.telefono || ''),
                    cedula: String(def.cedula || ''),
                    titular: String(def.titular || ''),
                };
            }
        }

        const mergedPayment = {
            ...currentPayment,
            ...(updates.payment || {}),
            pagoMovil: primaryPm,
            pagoMovilAccounts: updatedPmAccounts,
            zelle: {
                ...currentZelle,
                ...((updates.payment && updates.payment.zelle) || {})
            }
        };

        const currentLabels = (currentConfig.labels || {}) as Record<string, unknown>;
        const mergedLabels = {
            ...currentLabels,
            ...(updates.labels || {})
        };

        const palette = updates.palette !== undefined ? (updates.palette || 'default') : (currentConfig.palette || 'default');
        const storePrefix = updates.storePrefix || currentConfig.storePrefix || tenantRow?.name?.slice(0, 3).toUpperCase() || 'VEN';

        const namespaceUpdates: Array<{ namespace: string; dataJson: string }> = [
            { namespace: 'business', dataJson: JSON.stringify(mergedBusiness) },
            { namespace: 'contact', dataJson: JSON.stringify(mergedContact) },
            { namespace: 'landing', dataJson: JSON.stringify(mergedLanding) },
            { namespace: 'payment', dataJson: JSON.stringify(mergedPayment) },
            { namespace: 'labels', dataJson: JSON.stringify(mergedLabels) },
            { namespace: 'theme', dataJson: JSON.stringify({ palette }) }
        ];

        const fullConsolidatedConfig = {
            business: mergedBusiness,
            contact: mergedContact,
            landing: mergedLanding,
            payment: mergedPayment,
            labels: mergedLabels,
            palette,
            storePrefix
        };

        const newName = updates.business?.name || tenantRow?.name || 'Tienda';
        const newTemplate = updates.template || tenantRow?.template || 'restaurant';
        const newWhatsapp = updates.contact?.whatsapp || tenantRow?.whatsapp || '';

        await this.repo.saveSettingsBatch(
            tenantId,
            {
                name: newName,
                template: newTemplate,
                whatsapp: newWhatsapp,
                configJson: JSON.stringify(fullConsolidatedConfig)
            },
            namespaceUpdates
        );

        if (kv) {
            await invalidateTenantCache(kv, tenantId, tenantDomain || tenantRow?.domain);
        }

        return ok({
            message: "Configuración de la tienda actualizada con éxito.",
            config: fullConsolidatedConfig
        });
    }
}
