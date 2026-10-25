export {};

interface BillingInfo {
    expiresAt?: string | null;
    paymentStatus?: 'active' | 'pending' | 'overdue';
    notes?: string;
    updatedAt?: string;
}

interface TenantItem {
    id: string;
    name: string;
    plan: string;
    active: number;
    created_at: string;
    template: string;
    whatsapp?: string | null;
    domain?: string | null;
    owner_email?: string | null;
    product_count?: number;
    order_count_month?: number;
    revenue_month?: number;
    billing?: BillingInfo | null;
}

interface SystemSummary {
    totalTenants: number;
    activeTenants: number;
    suspendedTenants: number;
    mrr: number;
    totalRevenueMonth: number;
    totalOrdersMonth: number;
    templateBreakdown: Record<string, number>;
}

// Global State
let masterToken = sessionStorage.getItem('sa_token') || '';
let allTenants: TenantItem[] = [];
let activeTemplateFilter = 'all';

// DOM Elements
const loginStep = document.getElementById('sa-login-step');
const dashboardStep = document.getElementById('sa-dashboard-step');
const loginBtn = document.getElementById('sa-login-btn');
const passInput = document.getElementById('sa-password') as HTMLInputElement | null;
const errorMsg = document.getElementById('sa-error');
const tbody = document.getElementById('sa-tenants-list');
const logoutBtn = document.getElementById('sa-logout-btn');
const refreshBtn = document.getElementById('sa-refresh-btn');
const cleanupBtn = document.getElementById('sa-cleanup-btn');
const exportCsvBtn = document.getElementById('sa-export-csv-btn');

// Search & Filter Elements
const searchInput = document.getElementById('sa-search-input') as HTMLInputElement | null;
const searchClearBtn = document.getElementById('sa-search-clear');
const filterStatus = document.getElementById('sa-filter-status') as HTMLSelectElement | null;
const filterPlan = document.getElementById('sa-filter-plan') as HTMLSelectElement | null;
const filterBilling = document.getElementById('sa-filter-billing') as HTMLSelectElement | null;
const templateChipsContainer = document.getElementById('sa-template-chips');
const visibleCountEl = document.getElementById('sa-visible-count');

// Modal Elements
const billingModal = document.getElementById('sa-billing-modal');
const modalCloseBtn = document.getElementById('sa-modal-close');
const modalCancelBtn = document.getElementById('modal-btn-cancel');
const modalSaveBtn = document.getElementById('modal-btn-save');
const modalTenantId = document.getElementById('modal-tenant-id') as HTMLInputElement | null;
const modalTenantName = document.getElementById('modal-tenant-name');
const modalExpiresDate = document.getElementById('modal-expires-date') as HTMLInputElement | null;
const modalPaymentStatus = document.getElementById('modal-payment-status') as HTMLSelectElement | null;
const modalBillingNotes = document.getElementById('modal-billing-notes') as HTMLTextAreaElement | null;
const modalPlus30Btn = document.getElementById('modal-btn-plus30');
const modalPlus365Btn = document.getElementById('modal-btn-plus365');

// Toast Element
const toastEl = document.getElementById('sa-toast');
const toastMsg = document.getElementById('sa-toast-msg');
const toastIcon = document.getElementById('sa-toast-icon');
let toastTimer: number | null = null;

// Initialize
if (masterToken) {
    showDashboard();
}

// -------------------------------------------------------------
// Authentication Flow
// -------------------------------------------------------------

loginBtn?.addEventListener('click', handleLogin);
passInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleLogin();
});

async function handleLogin() {
    if (!passInput) return;
    const pass = passInput.value.trim();
    if (!pass) return;

    masterToken = `Bearer ${pass}`;

    try {
        const res = await fetch('/api/superadmin/tenants', {
            headers: { Authorization: masterToken },
        });

        if (res.ok) {
            sessionStorage.setItem('sa_token', masterToken);
            if (errorMsg) errorMsg.classList.add('hidden');
            showDashboard();
        } else if (res.status === 503) {
            showError('El sistema Superadmin no está configurado (SUPERADMIN_KEY ausente).');
        } else {
            showError('Contraseña incorrecta.');
            masterToken = '';
        }
    } catch {
        showError('Error de conexión con el servidor.');
    }
}

function showError(msg: string) {
    if (!errorMsg) return;
    errorMsg.textContent = msg;
    errorMsg.classList.remove('hidden');
}

logoutBtn?.addEventListener('click', () => {
    sessionStorage.removeItem('sa_token');
    masterToken = '';
    dashboardStep?.classList.add('hidden');
    loginStep?.classList.remove('hidden');
    if (passInput) passInput.value = '';
});

refreshBtn?.addEventListener('click', () => {
    loadTenants();
    showToast('Datos actualizados', 'info');
});

// -------------------------------------------------------------
// Dashboard & Data Loading
// -------------------------------------------------------------

async function showDashboard() {
    loginStep?.classList.add('hidden');
    dashboardStep?.classList.remove('hidden');
    await loadTenants();
}

async function loadTenants() {
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="8" class="sa-table-center">Cargando tiendas...</td></tr>';

    try {
        const res = await fetch('/api/superadmin/tenants', {
            headers: { Authorization: masterToken },
        });

        if (!res.ok) {
            if (res.status === 401) {
                sessionStorage.removeItem('sa_token');
                window.location.reload();
                return;
            }
            throw new Error(`Error HTTP: ${res.status}`);
        }

        const data = (await res.json()) as any;
        if (Array.isArray(data)) {
            allTenants = data;
            updateStatsFallback(data);
        } else {
            allTenants = data.tenants || [];
            updateExecutiveKPIs(data.summary || {});
        }

        renderTemplateChips();
        applyFiltersAndRender();
    } catch (err) {
        console.error('Error cargando tiendas:', err);
        if (tbody) {
            tbody.innerHTML =
                '<tr><td colspan="8" class="sa-table-center sa-error">Error al cargar datos del servidor.</td></tr>';
        }
    }
}

// -------------------------------------------------------------
// Executive KPIs & Summary
// -------------------------------------------------------------

function updateExecutiveKPIs(summary: Partial<SystemSummary>) {
    const total = summary.totalTenants ?? allTenants.length;
    const active = summary.activeTenants ?? allTenants.filter((t) => t.active === 1).length;
    const suspended = summary.suspendedTenants ?? total - active;
    const mrr = summary.mrr ?? 0;
    const gmv = summary.totalRevenueMonth ?? 0;
    const orders = summary.totalOrdersMonth ?? 0;

    const statTotal = document.getElementById('stat-total');
    const statActive = document.getElementById('stat-active');
    const statSuspended = document.getElementById('stat-suspended');
    const statActiveRatio = document.getElementById('stat-active-ratio');
    const statMrr = document.getElementById('stat-mrr');
    const statGmv = document.getElementById('stat-gmv');
    const statOrders = document.getElementById('stat-orders');

    if (statTotal) statTotal.textContent = String(total);
    if (statActive) statActive.textContent = `${active} activas`;
    if (statSuspended) statSuspended.textContent = `${suspended} suspendidas`;
    if (statActiveRatio) statActiveRatio.textContent = `${active}/${total} Activas`;
    if (statMrr) statMrr.textContent = `$${mrr.toLocaleString('en-US')}`;
    if (statGmv)
        statGmv.textContent = `$${gmv.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (statOrders) statOrders.textContent = String(orders);
}

function updateStatsFallback(tenants: TenantItem[]) {
    let mrr = 0;
    let gmv = 0;
    let orders = 0;
    for (const t of tenants) {
        if (t.active === 1) {
            mrr += t.plan === 'enterprise' ? 99 : t.plan === 'pro' ? 30 : 15;
        }
        gmv += Number(t.revenue_month || 0);
        orders += Number(t.order_count_month || 0);
    }
    updateExecutiveKPIs({
        totalTenants: tenants.length,
        activeTenants: tenants.filter((t) => t.active === 1).length,
        suspendedTenants: tenants.filter((t) => t.active !== 1).length,
        mrr,
        totalRevenueMonth: gmv,
        totalOrdersMonth: orders,
    });
}

// -------------------------------------------------------------
// Template Breakdown Filter Chips
// -------------------------------------------------------------

const TEMPLATE_NAMES: Record<string, { label: string; icon: string }> = {
    restaurant: { label: 'Restaurante', icon: '🍽️' },
    hardware: { label: 'Ferretería', icon: '🔧' },
    fashion: { label: 'Moda & Ropa', icon: '👗' },
    tech: { label: 'Tecnología', icon: '💻' },
    autoparts: { label: 'Repuestos', icon: '🚗' },
    grocery: { label: 'Bodegón / Super', icon: '🛒' },
};

function renderTemplateChips() {
    if (!templateChipsContainer) return;

    const counts: Record<string, number> = {};
    for (const t of allTenants) {
        const tpl = t.template || 'restaurant';
        counts[tpl] = (counts[tpl] || 0) + 1;
    }

    let chipsHtml = `
        <button type="button" class="sa-chip ${activeTemplateFilter === 'all' ? 'active' : ''}" data-template="all">
            Todas (${allTenants.length})
        </button>
    `;

    for (const [key, meta] of Object.entries(TEMPLATE_NAMES)) {
        const count = counts[key] || 0;
        if (count > 0 || activeTemplateFilter === key) {
            chipsHtml += `
                <button type="button" class="sa-chip ${activeTemplateFilter === key ? 'active' : ''}" data-template="${key}">
                    ${meta.icon} ${meta.label} (${count})
                </button>
            `;
        }
    }

    templateChipsContainer.innerHTML = chipsHtml;
}

templateChipsContainer?.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement)?.closest('.sa-chip') as HTMLElement | null;
    if (!target) return;
    activeTemplateFilter = target.dataset.template || 'all';
    renderTemplateChips();
    applyFiltersAndRender();
});

// -------------------------------------------------------------
// Search & Filter Logic
// -------------------------------------------------------------

searchInput?.addEventListener('input', () => {
    if (searchClearBtn) {
        if (searchInput.value.trim().length > 0) {
            searchClearBtn.classList.remove('hidden');
        } else {
            searchClearBtn.classList.add('hidden');
        }
    }
    applyFiltersAndRender();
});

searchClearBtn?.addEventListener('click', () => {
    if (searchInput) searchInput.value = '';
    searchClearBtn.classList.add('hidden');
    applyFiltersAndRender();
});

filterStatus?.addEventListener('change', applyFiltersAndRender);
filterPlan?.addEventListener('change', applyFiltersAndRender);
filterBilling?.addEventListener('change', applyFiltersAndRender);

function applyFiltersAndRender() {
    const term = (searchInput?.value || '').toLowerCase().trim();
    const statusVal = filterStatus?.value || 'all';
    const planVal = filterPlan?.value || 'all';
    const billingVal = filterBilling?.value || 'all';

    const now = new Date();

    const filtered = allTenants.filter((t) => {
        // Template filter
        if (activeTemplateFilter !== 'all' && (t.template || 'restaurant') !== activeTemplateFilter) {
            return false;
        }

        // Status filter
        if (statusVal === 'active' && t.active !== 1) return false;
        if (statusVal === 'suspended' && t.active === 1) return false;

        // Plan filter
        if (planVal !== 'all' && t.plan !== planVal) return false;

        // Billing filter
        if (billingVal !== 'all') {
            const expDateStr = t.billing?.expiresAt;
            if (!expDateStr) {
                if (billingVal !== 'warning') return false;
            } else {
                const expDate = new Date(expDateStr);
                const diffDays = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                if (billingVal === 'active' && diffDays < 5) return false;
                if (billingVal === 'warning' && (diffDays < 0 || diffDays > 5)) return false;
                if (billingVal === 'overdue' && diffDays >= 0) return false;
            }
        }

        // Text search (ID, name, whatsapp, owner_email)
        if (term) {
            const matchesId = t.id.toLowerCase().includes(term);
            const matchesName = (t.name || '').toLowerCase().includes(term);
            const matchesWa = (t.whatsapp || '').toLowerCase().includes(term);
            const matchesEmail = (t.owner_email || '').toLowerCase().includes(term);
            if (!matchesId && !matchesName && !matchesWa && !matchesEmail) {
                return false;
            }
        }

        return true;
    });

    if (visibleCountEl) {
        visibleCountEl.textContent = `Mostrando ${filtered.length} de ${allTenants.length} tiendas`;
    }

    renderTable(filtered);
}

// -------------------------------------------------------------
// Table Rendering
// -------------------------------------------------------------

function renderTable(tenants: TenantItem[]) {
    if (!tbody) return;

    if (tenants.length === 0) {
        tbody.innerHTML =
            '<tr><td colspan="8" class="sa-table-center">No se encontraron tiendas con los filtros seleccionados.</td></tr>';
        return;
    }

    const now = new Date();

    tbody.innerHTML = tenants
        .map((t) => {
            const isActive = t.active === 1;
            const statusBadge = isActive
                ? '<span class="badge badge-active">Activo</span>'
                : '<span class="badge badge-suspended">Suspendido</span>';

            const templateMeta = TEMPLATE_NAMES[t.template] || { label: t.template, icon: '📦' };

            // Usage and limits
            const prodCount = Number(t.product_count || 0);
            const orderCount = Number(t.order_count_month || 0);
            const revMonth = Number(t.revenue_month || 0);
            const maxProd = t.plan === 'basic' ? 30 : t.plan === 'pro' ? 200 : '∞';
            const isNearLimit = typeof maxProd === 'number' && prodCount >= maxProd;
            const usageBadgeClass = isNearLimit ? 'sa-usage-badge limit-warning' : 'sa-usage-badge';

            // Billing status calculation
            let billingBadgeHtml = '<span class="billing-badge billing-badge-warning">Trial / Sin fecha</span>';
            let daysRemaining: number | null = null;

            if (t.billing?.expiresAt) {
                const expDate = new Date(t.billing.expiresAt);
                daysRemaining = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

                if (daysRemaining < 0) {
                    billingBadgeHtml = `<span class="billing-badge billing-badge-overdue">Vencido (${Math.abs(daysRemaining)}d)</span>`;
                } else if (daysRemaining <= 5) {
                    billingBadgeHtml = `<span class="billing-badge billing-badge-warning">Vence en ${daysRemaining}d</span>`;
                } else {
                    billingBadgeHtml = `<span class="billing-badge billing-badge-active">Al día (${daysRemaining}d)</span>`;
                }
            }

            // WhatsApp payment reminder URL
            const cleanWa = (t.whatsapp || '').replace(/[^0-9]/g, '');
            let waButtonHtml = '';
            if (cleanWa) {
                const reminderMsg = encodeURIComponent(
                    `Hola ${t.name}, te saludamos de Ventrina SaaS 👋. Te recordamos la cuota mensual de tu catálogo virtual (Plan ${t.plan.toUpperCase()}). ¿Deseas renovar tu servicio hoy? Quedamos atentos.`,
                );
                waButtonHtml = `
                <a href="https://wa.me/${cleanWa}?text=${reminderMsg}" target="_blank" class="btn-mini btn-mini-wa" title="Enviar recordatorio de pago por WhatsApp">
                    💬 Cobrar
                </a>
            `;
            }

            // URLs
            const storeUrl = t.domain ? `https://${t.domain}` : `https://${t.id}.ventrina.app`;
            const waContactLink = cleanWa
                ? `<a href="https://wa.me/${cleanWa}" target="_blank" class="whatsapp-link-sm" title="Contactar por WhatsApp">📱 +${cleanWa}</a>`
                : '<span class="tenant-meta-sub">Sin WhatsApp</span>';

            const ownerEmailDisplay = t.owner_email ? `<span title="Dueño / Admin">✉️ ${t.owner_email}</span>` : '';

            const btnSuspend = isActive
                ? `<button class="btn-suspend" data-action="toggle-status" data-tenant-id="${t.id}" data-status="0" title="Suspender acceso a la tienda">Suspender</button>`
                : `<button class="btn-suspend activate" data-action="toggle-status" data-tenant-id="${t.id}" data-status="1" title="Reactivar acceso a la tienda">Activar</button>`;

            return `
            <tr>
                <td>
                    <div class="tenant-cell-main">
                        <a href="${storeUrl}" target="_blank" class="tenant-link">
                            ${t.id}.ventrina.app ↗
                        </a>
                        <span class="tenant-id-sub">${t.id}</span>
                    </div>
                </td>
                <td>
                    <div class="tenant-owner-row">
                        <span class="tenant-business-name">${escapeHtml(t.name)}</span>
                        <div class="tenant-meta-sub">
                            ${waContactLink}
                            ${ownerEmailDisplay}
                        </div>
                    </div>
                </td>
                <td>
                    <span class="badge badge-template">
                        ${templateMeta.icon} ${templateMeta.label}
                    </span>
                </td>
                <td>
                    <select class="action-select" data-action="change-plan" data-tenant-id="${t.id}">
                        <option value="basic" ${t.plan === 'basic' ? 'selected' : ''}>Básico ($15 / 30 prod)</option>
                        <option value="pro" ${t.plan === 'pro' ? 'selected' : ''}>PRO ($30 / 200 prod)</option>
                        <option value="enterprise" ${t.plan === 'enterprise' ? 'selected' : ''}>Enterprise ($99 / Ilimitado)</option>
                    </select>
                    <div>
                        <span class="${usageBadgeClass}">${prodCount} / ${maxProd} prod.</span>
                    </div>
                </td>
                <td>
                    <div class="billing-cell">
                        ${billingBadgeHtml}
                        <div class="billing-actions-row">
                            <button type="button" class="btn-mini" data-action="manage-billing" data-tenant-id="${t.id}" title="Configurar fecha de expiración y notas">
                                ⚙️ Facturación
                            </button>
                            ${waButtonHtml}
                        </div>
                    </div>
                </td>
                <td>
                    <div class="sa-usage-sub">
                        <strong>${orderCount}</strong> pedidos este mes
                    </div>
                    <div class="sa-usage-sub">
                        <strong>$${revMonth.toFixed(2)}</strong> transaccionados
                    </div>
                </td>
                <td>${statusBadge}</td>
                <td class="sa-table-right">
                    <div class="table-actions-cell">
                        <button type="button" class="btn-impersonate" data-action="impersonate" data-tenant-id="${t.id}" title="Entrar directamente al panel administrativo de esta tienda">
                            👤 Entrar Admin
                        </button>
                        ${btnSuspend}
                    </div>
                </td>
            </tr>
        `;
        })
        .join('');
}

// -------------------------------------------------------------
// Action Handlers & Event Delegation
// -------------------------------------------------------------

if (tbody) {
    // 1. Plan Change
    tbody.addEventListener('change', async (e) => {
        const target = e.target as HTMLElement | null;
        if (target?.matches('select[data-action="change-plan"]')) {
            const select = target as unknown as HTMLSelectElement;
            const tenantId = select.dataset.tenantId;
            if (!tenantId) return;
            const newPlan = select.value;
            if (!confirm(`¿Cambiar el plan de la tienda "${tenantId}" a ${newPlan.toUpperCase()}?`)) {
                loadTenants();
                return;
            }
            await updateTenant(tenantId, 'change_plan', newPlan);
        }
    });

    // 2. Click Actions (Impersonate, Toggle Status, Manage Billing)
    tbody.addEventListener('click', async (e) => {
        const target = e.target as HTMLElement | null;

        // Toggle Status
        const btnSuspend = target?.closest('button[data-action="toggle-status"]') as HTMLButtonElement | null;
        if (btnSuspend) {
            const tenantId = btnSuspend.dataset.tenantId;
            const newStatus = Number(btnSuspend.dataset.status);
            if (!tenantId) return;
            const actionText = newStatus === 1 ? 'ACTIVAR' : 'SUSPENDER';
            if (!confirm(`¿Estás seguro que deseas ${actionText} a la tienda "${tenantId}"?`)) return;
            await updateTenant(tenantId, 'toggle_status', newStatus);
            return;
        }

        // Impersonate
        const btnImpersonate = target?.closest('button[data-action="impersonate"]') as HTMLButtonElement | null;
        if (btnImpersonate) {
            const tenantId = btnImpersonate.dataset.tenantId;
            if (!tenantId) return;
            await handleImpersonate(tenantId);
            return;
        }

        // Manage Billing
        const btnBilling = target?.closest('button[data-action="manage-billing"]') as HTMLButtonElement | null;
        if (btnBilling) {
            const tenantId = btnBilling.dataset.tenantId;
            if (!tenantId) return;
            openBillingModal(tenantId);
            return;
        }
    });
}

// Impersonate API Call
async function handleImpersonate(tenantId: string) {
    showToast(`Iniciando sesión de soporte en "${tenantId}"...`, 'info');

    try {
        const res = await fetch('/api/superadmin/tenants', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                Authorization: masterToken,
            },
            body: JSON.stringify({ tenantId, action: 'impersonate' }),
        });

        const data = (await res.json()) as any;
        if (res.ok && data.success) {
            showToast(`Sesión de soporte creada para ${tenantId}`, 'success');
            // Abre el admin en una nueva pestaña
            window.open(data.redirectUrl, '_blank');
        } else {
            showToast(data.error || 'Error al iniciar sesión como administrador.', 'error');
        }
    } catch {
        showToast('Error de conexión al impersonar.', 'error');
    }
}

// Update Tenant Generic
async function updateTenant(tenantId: string, action: string, value: any) {
    try {
        const res = await fetch('/api/superadmin/tenants', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                Authorization: masterToken,
            },
            body: JSON.stringify({ tenantId, action, value }),
        });

        const data = (await res.json()) as any;
        if (res.ok) {
            showToast(data.message || 'Actualizado correctamente.', 'success');
            await loadTenants();
        } else {
            showToast(data.error || 'Error al actualizar.', 'error');
        }
    } catch {
        showToast('Error de red al actualizar tienda.', 'error');
    }
}

// -------------------------------------------------------------
// Billing Management Modal
// -------------------------------------------------------------

function openBillingModal(tenantId: string) {
    const tenant = allTenants.find((t) => t.id === tenantId);
    if (!tenant || !billingModal) return;

    if (modalTenantId) modalTenantId.value = tenant.id;
    if (modalTenantName) modalTenantName.textContent = `${tenant.name} (${tenant.id}.ventrina.app)`;

    const expiresAt = tenant.billing?.expiresAt ? tenant.billing.expiresAt.substring(0, 10) : '';
    if (modalExpiresDate) modalExpiresDate.value = expiresAt;
    if (modalPaymentStatus) modalPaymentStatus.value = tenant.billing?.paymentStatus || 'active';
    if (modalBillingNotes) modalBillingNotes.value = tenant.billing?.notes || '';

    billingModal.classList.remove('hidden');
}

function closeBillingModal() {
    billingModal?.classList.add('hidden');
}

modalCloseBtn?.addEventListener('click', closeBillingModal);
modalCancelBtn?.addEventListener('click', closeBillingModal);

modalPlus30Btn?.addEventListener('click', () => {
    if (!modalExpiresDate) return;
    const base = modalExpiresDate.value ? new Date(modalExpiresDate.value) : new Date();
    base.setDate(base.getDate() + 30);
    modalExpiresDate.value = base.toISOString().substring(0, 10);
});

modalPlus365Btn?.addEventListener('click', () => {
    if (!modalExpiresDate) return;
    const base = modalExpiresDate.value ? new Date(modalExpiresDate.value) : new Date();
    base.setFullYear(base.getFullYear() + 1);
    modalExpiresDate.value = base.toISOString().substring(0, 10);
});

modalSaveBtn?.addEventListener('click', async () => {
    if (!modalTenantId) return;
    const tenantId = modalTenantId.value;
    const expiresAt = modalExpiresDate?.value ? new Date(modalExpiresDate.value).toISOString() : null;
    const paymentStatus = modalPaymentStatus?.value || 'active';
    const notes = modalBillingNotes?.value || '';

    await updateTenant(tenantId, 'update_billing', {
        expiresAt,
        paymentStatus,
        notes,
    });

    closeBillingModal();
});

// -------------------------------------------------------------
// Maintenance / Cleanup Endpoint Call
// -------------------------------------------------------------

cleanupBtn?.addEventListener('click', async () => {
    if (
        !confirm(
            '¿Deseas ejecutar el mantenimiento del sistema (purga de sesiones inactivas y limpieza de rate-limits)?',
        )
    ) {
        return;
    }

    showToast('Ejecutando mantenimiento en Cloudflare...', 'info');

    try {
        const res = await fetch('/api/cleanup', {
            method: 'POST',
            headers: { Authorization: masterToken },
        });

        const data = (await res.json()) as any;
        if (res.ok && data.success) {
            const sessionsPurged = data.purged?.sessions ?? 0;
            showToast(`Mantenimiento completado: ${sessionsPurged} sesiones inactivas purgadas.`, 'success');
        } else {
            showToast(data.error || 'Error al ejecutar mantenimiento.', 'error');
        }
    } catch {
        showToast('Error de red al conectar con endpoint de mantenimiento.', 'error');
    }
});

// -------------------------------------------------------------
// Export to CSV
// -------------------------------------------------------------

exportCsvBtn?.addEventListener('click', () => {
    if (allTenants.length === 0) {
        showToast('No hay tiendas para exportar.', 'error');
        return;
    }

    const headers = [
        'ID Subdominio',
        'Nombre del Negocio',
        'Email Propietario',
        'WhatsApp',
        'Plantilla',
        'Plan',
        'Estado',
        'Total Productos',
        'Pedidos Este Mes',
        'Ventas Mes (USD)',
        'Vencimiento Facturacion',
        'Estado Cobro',
        'Notas Cobro',
        'Fecha Registro',
    ];

    const rows = allTenants.map((t) => [
        t.id,
        `"${(t.name || '').replace(/"/g, '""')}"`,
        t.owner_email || '',
        t.whatsapp || '',
        t.template || 'restaurant',
        t.plan,
        t.active === 1 ? 'Activo' : 'Suspendido',
        t.product_count || 0,
        t.order_count_month || 0,
        Number(t.revenue_month || 0).toFixed(2),
        t.billing?.expiresAt ? t.billing.expiresAt.substring(0, 10) : 'N/A',
        t.billing?.paymentStatus || 'active',
        `"${(t.billing?.notes || '').replace(/"/g, '""')}"`,
        t.created_at ? t.created_at.substring(0, 10) : '',
    ]);

    const csvContent = `\uFEFF${[headers.join(','), ...rows.map((r) => r.join(','))].join('\n')}`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    const dateStr = new Date().toISOString().substring(0, 10);
    link.setAttribute('download', `ventrina_tiendas_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast('Archivo CSV generado y descargado.', 'success');
});

// -------------------------------------------------------------
// Helpers & Toast Notifications
// -------------------------------------------------------------

function escapeHtml(str: string): string {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function showToast(message: string, type: 'info' | 'success' | 'error' = 'info') {
    if (!toastEl || !toastMsg || !toastIcon) return;

    if (toastTimer) clearTimeout(toastTimer);

    toastMsg.textContent = message;
    toastEl.className = `sa-toast ${type}`;
    toastIcon.textContent = type === 'success' ? '✅' : type === 'error' ? '⚠️' : 'ℹ️';

    toastEl.classList.remove('hidden');

    toastTimer = window.setTimeout(() => {
        toastEl.classList.add('hidden');
    }, 3800);
}
