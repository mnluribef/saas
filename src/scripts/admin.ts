// src/scripts/admin.ts
// Panel Administrativo - Ventrina SaaS
import QRCode from 'qrcode';

declare const lucide: any;
declare const Chart: any;

declare global {
    interface Window {
        [key: string]: any;
    }
}

// Variables de estado
let currentAdmin: string | null = null;
let ordersList: any[] = [];
let productsList: any[] = [];
let salesList: any[] = [];
let currentBcvRate = 853.50;
let currentBcvAuto = true;
let lastBcvUpdated = '';
let lastBcvSource = '';
let ordersSearchQuery = '';
let ordersStatusFilter = '';
let ordersDateFilter = 'all';
let salesSearchQuery = '';
let productsSearchQuery = '';
let activeStockFilter = 'all';
let selectedProductIds = new Set<string>();
let lastKnownOrderCount: number | null = null;
let soundEnabled = localStorage.getItem('admin_sound_enabled') !== 'false';

// Paginación State
let ordersPage = 1;
let ordersTotalPages = 1;
let ordersTotalCount = 0;
let productsPage = 1;
let productsTotalPages = 1;
let productsTotalCount = 0;
let salesPage = 1;
let salesTotalPages = 1;
let salesTotalCount = 0;


// Helper DOM accessors
function $val(id: string): string {
    const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
    return el ? el.value.trim() : '';
}
function setVal(id: string, val: any) {
    const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
    if (el) el.value = val !== undefined && val !== null ? String(val) : '';
}
function $input(id: string): HTMLInputElement | null {
    return document.getElementById(id) as HTMLInputElement | null;
}
function $btn(id: string): HTMLButtonElement | null {
    return document.getElementById(id) as HTMLButtonElement | null;
}

function getRowVal(r: Element, selector: string): string {
    const el = r.querySelector(selector) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
    return el ? el.value.trim() : '';
}

// Elementos del DOM
const loader = document.getElementById('page-loader');
const loginContainer = document.getElementById('login-container');
const dashboardContainer = document.getElementById('dashboard-container');
const loginForm = document.getElementById('login-form') as HTMLFormElement | null;
const btnLogout = document.getElementById('btn-logout') as HTMLButtonElement | null;
const toastContainer = document.getElementById('toast-container');

// Navegación Sidebar
const sidebarLinks = document.querySelectorAll('.sidebar-link[data-target]');
const sections = document.querySelectorAll('.dashboard-section');
const dashboardTitle = document.getElementById('dashboard-title');
const dashboardSubtitle = document.getElementById('dashboard-subtitle');

// Formularios e Inventario
const productForm = document.getElementById('product-form') as HTMLFormElement | null;
const btnCancelEdit = document.getElementById('btn-cancel-edit') as HTMLButtonElement | null;
const formProductTitle = document.getElementById('form-product-title');
const btnSubmitProduct = document.getElementById('btn-submit-product') as HTMLButtonElement | null;
const btnToggleProductForm = document.getElementById('btn-toggle-product-form') as HTMLButtonElement | null;

// Modal Detalles Pedido
const orderModal = document.getElementById('order-detail-modal');
const btnCloseModal = document.getElementById('btn-close-modal') as HTMLButtonElement | null;
const btnCloseModalFooter = document.getElementById('btn-modal-close-footer') as HTMLButtonElement | null;

// Modal Registrar Pago
const paymentModal = document.getElementById('payment-modal');
const btnClosePaymentModal = document.getElementById('btn-close-payment-modal') as HTMLButtonElement | null;
const btnCancelPaymentModal = document.getElementById('btn-cancel-payment-modal') as HTMLButtonElement | null;
const paymentForm = document.getElementById('payment-form') as HTMLFormElement | null;
const paymentMethodSelect = document.getElementById('payment-method-select') as HTMLSelectElement | null;
const paymentReferenceInput = document.getElementById('payment-reference') as HTMLInputElement | null;
const paymentModalOrderId = document.getElementById('payment-modal-order-id') as HTMLInputElement | null;

// Modal Cambiar Contraseña
const changePasswordModal = document.getElementById('change-password-modal');
const btnOpenChangePassword = document.getElementById('btn-open-change-password') as HTMLButtonElement | null;
const btnClosePasswordModal = document.getElementById('btn-close-password-modal') as HTMLButtonElement | null;
const btnCancelPasswordModal = document.getElementById('btn-cancel-password-modal') as HTMLButtonElement | null;
const changePasswordForm = document.getElementById('change-password-form') as HTMLFormElement | null;

let pendingPaymentOrderId: string | null = null;
let pendingPaymentStatus: string | null = null;

// --- UTILIDAD DE SANITIZACIÓN CONTRA STORED XSS ---
function escapeHtml(str: any): string {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// --- HASHING DE CONTRASEÑA ---
/**
 * Hashea una contraseña usando SHA-256 nativo del navegador (hexadecimal)
 * @param {string} password 
 */
async function sha256(password: string): Promise<string> {
    const msgBuffer = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}

// --- SISTEMA DE TOASTS (NOTIFICACIONES) ---
/**
 * Muestra una notificación flotante segura
 * @param {string} message 
 * @param {string} type - 'success', 'error', 'warning', 'info'
 */
function showToast(message: string, type: string = 'success') {
    if (!toastContainer) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = 'check-circle';
    if (type === 'error') icon = 'alert-triangle';
    if (type === 'warning') icon = 'alert-circle';
    if (type === 'info') icon = 'info';

    const span = document.createElement('span');
    span.textContent = message;

    toast.innerHTML = `<i data-lucide="${icon}"></i>`;
    toast.appendChild(span);

    toastContainer.appendChild(toast);
    if (window.lucide) lucide.createIcons();

    setTimeout(() => {
        toast.remove();
    }, 4000);
}

function getStoreUrl(tenantId: string, customDomain?: string | null): string {
    if (customDomain) return `https://${customDomain}`;
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
        const port = window.location.port ? `:${window.location.port}` : '';
        return `${window.location.protocol}//${tenantId}.localhost${port}`;
    }
    return `https://${tenantId}.ventrina.app`;
}

// --- VERIFICACIÓN DE SESIÓN INICIAL ---
async function checkSession() {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('dev') === 'true' || urlParams.get('preview') === 'true') {
            currentAdmin = 'demo_admin';
            window.currentUserRole = 'admin';
            showDashboard();
            return;
        }

        const res = await fetch('/api/auth');
        const data = (await res.json()) as any;

        if (data.authenticated) {
            currentAdmin = data.email || data.username;
            window.currentUserRole = data.role || 'viewer';
            if (data.tenantId && data.tenantId !== 'demo') {
                const storeUrl = getStoreUrl(data.tenantId);
                const headerBtn = document.getElementById('btn-header-view-store') as HTMLAnchorElement | null;
                if (headerBtn) headerBtn.href = storeUrl;
                const previewBtn = document.getElementById('btn-preview-store') as HTMLAnchorElement | null;
                if (previewBtn) previewBtn.href = storeUrl;
                activeStoreUrl = storeUrl;
                refreshStoreQrCodes();
            }
            showDashboard();
        } else {
            showLogin();
        }
    } catch (err) {
        console.error("Error verificando sesión inicial:", err);
        showLogin();
    } finally {
        hideLoader();
    }
}

function showLogin() {
    if (loginContainer) {
        loginContainer.classList.remove('d-none');
        if (dashboardContainer) dashboardContainer.classList.add('d-none');
    } else {
        window.location.href = '/login';
    }
}

function showDashboard() {
    if (loginContainer) loginContainer.classList.add('d-none');
    if (dashboardContainer) dashboardContainer.classList.remove('d-none');
    
    // Mostrar insignia de admin
    const badge = document.getElementById('user-info-badge');
    const badgeName = document.getElementById('admin-user-name');
    if (badge && badgeName && currentAdmin) {
        badge.classList.remove('d-none');
        badgeName.textContent = currentAdmin.charAt(0).toUpperCase() + currentAdmin.slice(1);
        
        // Actualizar rol en la UI si el elemento existe
        const roleEl = document.querySelector('.user-role');
        if (roleEl && window.currentUserRole) {
            roleEl.textContent = window.currentUserRole.toUpperCase();
        }
    }

    // Cargar datos
    refreshAllData();
}

function hideLoader() {
    if (loader) {
        loader.classList.add('d-none');
    }
}

// --- FLUJO DE INICIO Y CIERRE DE SESIÓN ---

// Login Submit
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = $val('login-email') || $val('login-username');
        const passwordPlain = ($input('login-password')?.value || '');
        const submitBtn = $btn('login-btn-submit');

        if (!email || !passwordPlain) return;

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i data-lucide="loader" class="spin"></i> Verificando...';
        }
        if (window.lucide) lucide.createIcons();

        try {
            const urlTenant = new URLSearchParams(window.location.search).get('tenant') || undefined;

            const res = await fetch('/api/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password: passwordPlain, tenant: urlTenant })
            });

            const data = (await res.json()) as any;

            if (res.ok && data.success) {
                currentAdmin = data.email || data.username;
                showToast(`¡Bienvenido de vuelta, ${currentAdmin}! 👋`, 'success');
                showDashboard();
                loginForm.reset();
            } else {
                showToast(data.error || 'Credenciales inválidas', 'error');
            }
        } catch (err) {
            console.error(err);
            showToast('Error de red al intentar iniciar sesión', 'error');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = 'Iniciar Sesión <i data-lucide="arrow-right"></i>';
            }
            if (window.lucide) lucide.createIcons();
        }
    });
}

// Logout
if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
        try {
            await fetch('/api/auth', { method: 'DELETE' });
            currentAdmin = null;
            showToast('Sesión cerrada correctamente.', 'info');
            setTimeout(() => {
                window.location.href = '/login';
            }, 600);
        } catch (err) {
            console.error("Error en logout:", err);
            window.location.href = '/login';
        }
    });
}

// --- CAMBIAR CONTRASEÑA ---
if (btnOpenChangePassword && changePasswordModal) {
    btnOpenChangePassword.addEventListener('click', () => {
        changePasswordModal.classList.add('active');
        if (changePasswordForm) changePasswordForm.reset();
        document.getElementById('current-password-input')?.focus();
    });
}

function closePasswordModal() {
    if (changePasswordModal) changePasswordModal.classList.remove('active');
}
if (btnClosePasswordModal) btnClosePasswordModal.addEventListener('click', closePasswordModal);
if (btnCancelPasswordModal) btnCancelPasswordModal.addEventListener('click', closePasswordModal);
if (changePasswordModal) {
    changePasswordModal.addEventListener('click', (e) => {
        if (e.target === changePasswordModal) closePasswordModal();
    });
}

if (changePasswordForm) {
    changePasswordForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const currentPass = $val('current-password-input');
        const newPass = $val('new-password-input');
        const confirmPass = $val('confirm-password-input');
        const submitBtn = $btn('btn-submit-password');

        if (!currentPass || !newPass || !confirmPass) {
            showToast('Por favor completa todos los campos.', 'warning');
            return;
        }

        if (newPass.length < 8) {
            showToast('La nueva clave debe tener al menos 8 caracteres.', 'warning');
            return;
        }

        if (newPass !== confirmPass) {
            showToast('La nueva contraseña y su confirmación no coinciden.', 'warning');
            return;
        }

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i data-lucide="loader" class="spin"></i> Actualizando...';
        }
        if (window.lucide) lucide.createIcons();

        try {
            const res = await fetch('/api/auth', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ currentPassword: currentPass, newPassword: newPass })
            });

            const data = (await res.json()) as any;

            if (res.ok && data.success) {
                showToast('¡Contraseña cambiada exitosamente!', 'success');
                closePasswordModal();
                changePasswordForm.reset();
            } else {
                showToast(data.error || 'Error al cambiar la contraseña.', 'error');
            }
        } catch (err) {
            console.error(err);
            showToast('Error de red al actualizar contraseña.', 'error');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i data-lucide="save"></i> Actualizar Clave';
            }
            if (window.lucide) lucide.createIcons();
        }
    });
}

// --- NAVEGACIÓN ENTRE SECCIONES DEL SIDEBAR ---
sidebarLinks.forEach(link => {
    link.addEventListener('click', () => {
        sidebarLinks.forEach(l => l.classList.remove('active'));
        link.classList.add('active');

        const targetId = link.getAttribute('data-target');
        sections.forEach(sec => {
            sec.classList.remove('active');
            if (sec.id === targetId) sec.classList.add('active');
        });

        // Actualizar encabezados
        if (targetId === 'section-metrics') {
            if (dashboardTitle) dashboardTitle.textContent = 'Métricas Generales';
            if (dashboardSubtitle) dashboardSubtitle.textContent = 'Visión global de rendimiento, pedidos y catálogo.';
        } else if (targetId === 'section-orders') {
            if (dashboardTitle) dashboardTitle.textContent = 'Gestión de Pedidos';
            if (dashboardSubtitle) dashboardSubtitle.textContent = 'Revisa y actualiza el estado de los pedidos recibidos por la web.';
        } else if (targetId === 'section-sales') {
            if (dashboardTitle) dashboardTitle.textContent = 'Registro de Ventas';
            if (dashboardSubtitle) dashboardSubtitle.textContent = 'Histórico de pedidos completados y cobrados exitosamente.';
        } else if (targetId === 'section-inventory') {
            if (dashboardTitle) dashboardTitle.textContent = 'Catálogo y Productos';
            if (dashboardSubtitle) dashboardSubtitle.textContent = 'Agrega, edita precios y administra el inventario de tus productos.';
        } else if (targetId === 'section-coupons') {
            if (dashboardTitle) dashboardTitle.textContent = 'Cupones de Descuento';
            if (dashboardSubtitle) dashboardSubtitle.textContent = 'Crea códigos promocionales y campañas de descuento para tus clientes.';
            loadCoupons();
        } else if (targetId === 'section-billing') {
            if (dashboardTitle) dashboardTitle.textContent = 'Plan y Facturación';
            if (dashboardSubtitle) dashboardSubtitle.textContent = 'Gestiona los límites de tu cuenta y pagos de suscripción.';
            loadBillingData();
        } else if (targetId === 'section-settings') {
            if (dashboardTitle) dashboardTitle.textContent = 'Configuración de Tienda';
            if (dashboardSubtitle) dashboardSubtitle.textContent = 'Personaliza el nombre, contacto, WhatsApp, métodos de pago y delivery.';
            loadStoreSettings();
        }
    });
});

document.querySelectorAll('.view-all-orders-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const ordersTab = document.querySelector('.sidebar-link[data-target="section-orders"]') as HTMLElement | null;
        if (ordersTab) ordersTab.click();
    });
});

// --- CARGA Y RENDERIZACIÓN DE DATOS ---


// Cargar Tasa Oficial BCV
async function loadBcvRate() {
    try {
        const res = await fetch('/api/bcv');
        if (res.ok) {
            const data = (await res.json()) as any;
            currentBcvRate = parseFloat(data.rate) || 853.50;
            currentBcvAuto = data.autoUpdate !== false;
            lastBcvUpdated = data.lastUpdated || '';
            lastBcvSource = data.source || 'bcv_api';

            const display = document.getElementById('admin-bcv-val');
            if (display) display.textContent = `${currentBcvRate.toFixed(2)} Bs.`;
            
            const rateIn = $input('bcv-rate-input');
            if (rateIn) rateIn.value = currentBcvRate.toFixed(2);
            const toggle = $input('bcv-auto-toggle');
            if (toggle) toggle.checked = currentBcvAuto;
            const syncLabel = document.getElementById('bcv-last-sync-label') || document.getElementById('bcv-last-sync-text');
            if (syncLabel) {
                const dateStr = lastBcvUpdated ? new Date(lastBcvUpdated).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }) : 'reciente';
                syncLabel.textContent = `Última sincronización: ${dateStr} (${lastBcvSource === 'bcv_api' ? 'Oficial BCV' : 'Manual'})`;
            }
        }
    } catch (e) {
        console.error("Error al consultar tasa BCV:", e);
    }
}

let currentTenantPlanKey: string | null = null;
let currentTenantHasAnalytics: boolean = true;

async function loadBillingData() {
    try {
        const res = await fetch('/api/billing');
        if (res.ok) {
            const data = (await res.json()) as any;
            
            // Info de Plan
            if (data.tenant) {
                currentTenantPlanKey = data.tenant.planKey || (data.tenant.plan === 'Básico' || data.tenant.plan === 'basic' ? 'basic' : 'pro');
                currentTenantHasAnalytics = typeof data.tenant.hasAnalytics === 'boolean'
                    ? data.tenant.hasAnalytics
                    : Boolean(currentTenantPlanKey && ['pro', 'enterprise', 'demo'].includes(currentTenantPlanKey));
            }

            const elPlanName = document.getElementById('billing-plan-name');
            if (elPlanName) elPlanName.textContent = data.tenant.plan;
            
            const elTenantDomain = document.getElementById('billing-tenant-domain');
            if (elTenantDomain) elTenantDomain.textContent = data.tenant.domain;
            
            const elStatus = document.getElementById('billing-status');
            if (elStatus) elStatus.textContent = data.tenant.status;
            
            // Consumo de Pedidos
            const elOrdCurrent = document.getElementById('billing-orders-current');
            if (elOrdCurrent) {
                elOrdCurrent.textContent = data.usage.ordersThisMonth.current;
                (document.getElementById('billing-orders-limit') as HTMLElement).textContent = data.usage.ordersThisMonth.limit;
                (document.getElementById('billing-orders-bar') as HTMLElement).style.width = data.usage.ordersThisMonth.percentage + '%';
                const bop = document.getElementById('billing-orders-percent'); if (bop) bop.textContent = data.usage.ordersThisMonth.percentage + '% utilizado';
            }
            
            // Consumo de Productos
            const elProdCurrent = document.getElementById('billing-products-current');
            if (elProdCurrent) {
                elProdCurrent.textContent = data.usage.products.current;
                const bpl = document.getElementById('billing-products-limit'); if (bpl) bpl.textContent = data.usage.products.limit;
                const bpb = document.getElementById('billing-products-bar'); if (bpb) bpb.style.width = data.usage.products.percentage + '%';
                const bpp = document.getElementById('billing-products-percent'); if (bpp) bpp.textContent = data.usage.products.percentage + '% utilizado';
            }
            
            // Pagos
            const elBank = document.getElementById('pay-bank');
            if (elBank) {
                elBank.textContent = data.billing.bank;
                const pp = document.getElementById('pay-phone'); if (pp) pp.textContent = data.billing.phone;
                const pid = document.getElementById('pay-id'); if (pid) pid.textContent = data.billing.id;
                const pb = document.getElementById('pay-binance'); if (pb) pb.textContent = data.billing.binancePay;
                const pz = document.getElementById('pay-zelle'); if (pz) pz.textContent = data.billing.zelle;
                const pa = document.getElementById('pay-amount'); if (pa) pa.textContent = data.billing.monthlyPriceUsd;
            }
        }
    } catch (e) {
        console.error("Error cargando billing:", e);
    }
}

async function refreshAllData() {
    await loadBillingData();
    await Promise.all([
        loadBcvRate(),
        loadOrders(),
        loadProducts(),
        loadSales(),
        loadStats(),
        loadCoupons(),
        loadCategories()
    ]);
    renderMetrics();
}

// 1. Cargar Pedidos de la API
async function loadOrders(page = 1) {
    try {
        ordersPage = page;
        const res = await fetch(`/api/orders?page=${page}&limit=50`);
        if (!res.ok) throw new Error('No autorizado');
        const responseData = (await res.json()) as any;
        
        if (responseData.meta) {
            ordersTotalPages = responseData.meta.totalPages || 1;
            ordersTotalCount = responseData.meta.total ?? (responseData.data ? responseData.data.length : 0);
            ordersList = responseData.data || [];
        } else {
            ordersTotalPages = 1;
            ordersList = Array.isArray(responseData) ? responseData : (responseData.data || []);
            ordersTotalCount = ordersList.length;
        }

        // Detección de nuevo pedido para reproducir sonido y notificar
        if (lastKnownOrderCount !== null && ordersList.length > lastKnownOrderCount && page === 1) {
            const hasNewPending = ordersList.some(o => o.status === 'pendiente');
            if (hasNewPending) {
                playOrderChime();
                flashPageTitle();
                showToast('🔔 ¡Has recibido un nuevo pedido!', 'info');

                const pendingOrders = ordersList.filter(o => o.status === 'pendiente');
                const latestOrder = pendingOrders[0];
                const clientName = latestOrder?.client_name || 'Nuevo cliente';
                const total = latestOrder?.total_price ? `$${parseFloat(latestOrder.total_price).toFixed(2)}` : '';
                sendWebPushNotification(
                    '🔔 ¡Nuevo Pedido Recibido!',
                    `Pedido #${latestOrder?.id || ''} de ${clientName} (${total}). Haz clic para gestionarlo.`,
                    latestOrder?.id
                );
            }
        }
        if (page === 1) lastKnownOrderCount = ordersList.length;
        
        renderOrders();
        renderMetrics();
        updatePaginationUI('orders', ordersPage, ordersTotalPages);
    } catch (err) {
        console.error(err);
        showToast('Error al cargar pedidos del servidor.', 'error');
    }
}

// 2. Cargar Productos de la API (incluye inactivos)
async function loadProducts(page = 1) {
    try {
        productsPage = page;
        const res = await fetch(`/api/products?admin=true&page=${page}&limit=50`);
        if (!res.ok) throw new Error('No autorizado');
        const responseData = (await res.json()) as any;
        
        if (responseData.meta) {
            productsTotalPages = responseData.meta.totalPages || 1;
            productsTotalCount = responseData.meta.total ?? (responseData.data ? responseData.data.length : 0);
            productsList = responseData.data || [];
        } else {
            productsTotalPages = 1;
            productsList = Array.isArray(responseData) ? responseData : (responseData.data || []);
            productsTotalCount = productsList.length;
        }
        
        selectedProductIds.clear();
        updateBulkToolbar();
        updateCategoryDatalist();
        renderProductsTable();
        renderMetrics();
        updatePaginationUI('products', productsPage, productsTotalPages);
    } catch (err) {
        console.error(err);
        showToast('Error al cargar menú del servidor.', 'error');
    }
}

// 2.5 Cargar Registro de Ventas de la API
async function loadSales(dateFrom: string | null = null, dateTo: string | null = null, page: number = 1) {
    try {
        salesPage = page;
        let url = '/api/sales';
        const params = new URLSearchParams();
        if (dateFrom) params.append('date_from', dateFrom);
        if (dateTo) params.append('date_to', dateTo);
        params.append('page', String(page));
        params.append('limit', '50');
        
        if (params.toString()) {
            url += '?' + params.toString();
        }
        
        const res = await fetch(url);
        if (!res.ok) throw new Error('No autorizado');
        const responseData = (await res.json()) as any;
        
        if (responseData.meta) {
            salesTotalPages = responseData.meta.totalPages || 1;
            salesTotalCount = responseData.meta.total ?? (responseData.data ? responseData.data.length : 0);
            salesList = responseData.data || [];
        } else {
            salesTotalPages = 1;
            salesList = Array.isArray(responseData) ? responseData : (responseData.data || []);
            salesTotalCount = salesList.length;
        }
        
        renderSales();
        renderMetrics();
        updatePaginationUI('sales', salesPage, salesTotalPages);
    } catch (err) {
        console.error(err);
        showToast('Error al cargar ventas del servidor.', 'error');
    }
}

// 2.6 Cargar Estadísticas (Ingresos y Gráfica)
let salesChartInstance: any = null;
async function loadStats() {
    try {
        const res = await fetch('/api/sales?stats=true');
        if (!res.ok) throw new Error('No autorizado');
        const data = (await res.json()) as any;
        
        // Actualizar métrica de ingresos de hoy
        const metricRevenue = document.getElementById('metric-revenue');
        const metricRevenueBs = document.getElementById('metric-revenue-bs');
        if (metricRevenue) {
            const revenue = parseFloat(data.revenueToday) || 0;
            metricRevenue.textContent = `$${revenue.toFixed(2)}`;
            if (metricRevenueBs && currentBcvRate > 0) {
                metricRevenueBs.textContent = `≈ Bs ${(revenue * currentBcvRate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            }
        }
        
        // Renderizar gráfica
        renderChart(data.chartData || []);
        await loadAnalytics();
    } catch (err) {
        console.error(err);
    }
}

function renderAnalyticsLockedState() {
    const monthRevEl = document.getElementById('metric-month-revenue');
    const monthRevBsEl = document.getElementById('metric-month-revenue-bs');
    const growthContainer = document.getElementById('metric-growth-container');
    const avgTicketEl = document.getElementById('metric-average-ticket');
    const avgTicketBsEl = document.getElementById('metric-average-ticket-bs');

    if (monthRevEl) {
        monthRevEl.innerHTML = '<span class="badge-pro-locked"><i data-lucide="lock" class="icon-inline"></i> Plan Pro</span>';
    }
    if (monthRevBsEl) {
        monthRevBsEl.textContent = 'Disponible en planes Pro';
    }
    if (growthContainer) {
        growthContainer.innerHTML = '';
    }

    if (avgTicketEl) {
        avgTicketEl.innerHTML = '<span class="badge-pro-locked"><i data-lucide="lock" class="icon-inline"></i> Plan Pro</span>';
    }
    if (avgTicketBsEl) {
        avgTicketBsEl.textContent = 'Disponible en planes Pro';
    }

    const topProdContainer = document.getElementById('top-products-container');
    if (topProdContainer) {
        topProdContainer.innerHTML = `
            <div class="analytics-locked-state">
                <div class="analytics-locked-icon">
                    <i data-lucide="award"></i>
                </div>
                <h4>Ranking de Productos Pro</h4>
                <p>Identifica tus productos más vendidos, unidades facturadas y tendencias de demanda.</p>
                <button type="button" class="btn-action go-to-billing-btn">
                    <i data-lucide="zap"></i> Mejorar a Plan Pro
                </button>
            </div>
        `;
    }

    const breakdownContainer = document.getElementById('breakdown-container');
    if (breakdownContainer) {
        breakdownContainer.innerHTML = `
            <div class="analytics-locked-state">
                <div class="analytics-locked-icon">
                    <i data-lucide="pie-chart"></i>
                </div>
                <h4>Canales de Pago y Entrega</h4>
                <p>Conoce la distribución de métodos de pago y despacho preferidos por tus clientes.</p>
                <button type="button" class="btn-action go-to-billing-btn">
                    <i data-lucide="zap"></i> Mejorar a Plan Pro
                </button>
            </div>
        `;
    }

    if (window.lucide) {
        lucide.createIcons();
    }
}

async function loadAnalytics() {
    try {
        // Evitar petición a /api/analytics y el error 403 si el plan es básico/gratis
        if (currentTenantPlanKey && !currentTenantHasAnalytics) {
            renderAnalyticsLockedState();
            return;
        }

        const res = await fetch('/api/analytics');
        if (!res.ok) {
            if (res.status === 403) {
                currentTenantHasAnalytics = false;
                renderAnalyticsLockedState();
            }
            return;
        }
        const data = (await res.json()) as any;
        
        // 1. Ingresos Mes Actual y Crecimiento
        const monthRevEl = document.getElementById('metric-month-revenue');
        const monthRevBsEl = document.getElementById('metric-month-revenue-bs');
        const growthContainer = document.getElementById('metric-growth-container');
        if (monthRevEl && data.summary) {
            const revMonth = parseFloat(data.summary.revenueThisMonth) || 0;
            monthRevEl.textContent = `$${revMonth.toFixed(2)}`;
            if (monthRevBsEl && currentBcvRate > 0) {
                monthRevBsEl.textContent = `≈ Bs ${(revMonth * currentBcvRate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            }
            
            if (growthContainer) {
                const growth = data.summary.monthlyGrowthPercentage || 0;
                let badgeClass = 'badge-growth neutral';
                let arrow = '•';
                if (growth > 0) {
                    badgeClass = 'badge-growth positive';
                    arrow = '↑';
                } else if (growth < 0) {
                    badgeClass = 'badge-growth negative';
                    arrow = '↓';
                }
                growthContainer.innerHTML = `<span class="${badgeClass}">${arrow} ${Math.abs(growth)}% vs mes ant.</span>`;
            }
        }
        
        // 2. Ticket Promedio
        const avgTicketEl = document.getElementById('metric-average-ticket');
        const avgTicketBsEl = document.getElementById('metric-average-ticket-bs');
        if (avgTicketEl && data.summary) {
            const avg = parseFloat(data.summary.averageTicket) || 0;
            avgTicketEl.textContent = `$${avg.toFixed(2)}`;
            if (avgTicketBsEl && currentBcvRate > 0) {
                avgTicketBsEl.textContent = `≈ Bs ${(avg * currentBcvRate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            }
        }
        
        // 3. Top 5 Productos
        const topProdContainer = document.getElementById('top-products-container');
        if (topProdContainer) {
            if (!data.topProducts || data.topProducts.length === 0) {
                topProdContainer.innerHTML = `<p class="analytics-empty-note">Sin ventas registradas para generar ranking.</p>`;
            } else {
                topProdContainer.innerHTML = data.topProducts.map((p: any, idx: number) => {
                    const rankClass = idx === 0 ? 'rank-1' : idx === 1 ? 'rank-2' : idx === 2 ? 'rank-3' : '';
                    return `
                        <div class="top-product-row">
                            <div class="top-product-info">
                                <div class="top-product-rank ${rankClass}">${idx + 1}</div>
                                <div>
                                    <div class="top-product-name">${escapeHtml(p.product_name)}</div>
                                    <div class="top-product-sub">${p.total_qty} unidades vendidas</div>
                                </div>
                            </div>
                            <div class="top-product-stat">
                                <span class="top-product-qty">${p.total_qty} uds</span>
                                <div class="top-product-revenue">$${parseFloat(p.total_revenue || 0).toFixed(2)}</div>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        }
        
        // 4. Métodos de Pago y Entregas
        const breakdownContainer = document.getElementById('breakdown-container');
        if (breakdownContainer) {
            let html = '';
            
            // Pagos
            const totalPaymentOrders = (data.paymentMethods || []).reduce((acc: number, curr: any) => acc + (curr.count || 0), 0) || 1;
            html += `<div class="breakdown-section-title">Métodos de Pago</div>`;
            if (!data.paymentMethods || data.paymentMethods.length === 0) {
                html += `<p class="analytics-empty-note">Sin datos de métodos de pago.</p>`;
            } else {
                data.paymentMethods.forEach((pm: any) => {
                    const pct = Math.round((pm.count / totalPaymentOrders) * 100);
                    const name = pm.payment_method?.startsWith('pago_movil') ? `Pago Móvil${pm.payment_method.includes(':') ? ` (${pm.payment_method.split(':')[1]})` : ''}` :
                                 pm.payment_method === 'efectivo' ? 'Efectivo' :
                                 pm.payment_method === 'zelle' ? 'Zelle' :
                                 pm.payment_method === 'punto' ? 'Punto de Venta' : pm.payment_method;
                    html += `
                        <div class="breakdown-item">
                            <div class="breakdown-header">
                                <span>${escapeHtml(name)}</span>
                                <span class="breakdown-count">${pm.count} pedidos (${pct}%)</span>
                            </div>
                            <div class="breakdown-bar">
                                <div class="breakdown-fill" data-pct="${pct}"></div>
                            </div>
                        </div>
                    `;
                });
            }
            
            // Entregas
            const totalDeliveryOrders = (data.deliveryTypes || []).reduce((acc: number, curr: any) => acc + (curr.count || 0), 0) || 1;
            html += `<div class="breakdown-section-title delivery-section">Tipo de Entrega</div>`;
            if (!data.deliveryTypes || data.deliveryTypes.length === 0) {
                html += `<p class="analytics-empty-note">Sin datos de entregas.</p>`;
            } else {
                data.deliveryTypes.forEach((dt: any) => {
                    const pct = Math.round((dt.count / totalDeliveryOrders) * 100);
                    const name = dt.delivery_type === 'delivery' ? 'Delivery / Domicilio' : 'Retiro en Tienda / Pick-up';
                    html += `
                        <div class="breakdown-item">
                            <div class="breakdown-header">
                                <span>${escapeHtml(name)}</span>
                                <span class="breakdown-count">${dt.count} pedidos (${pct}%)</span>
                            </div>
                            <div class="breakdown-bar">
                                <div class="breakdown-fill" data-pct="${pct}"></div>
                            </div>
                        </div>
                    `;
                });
            }
            
            breakdownContainer.innerHTML = html;
            
            // Aplicar anchos de progreso
            breakdownContainer.querySelectorAll('.breakdown-fill').forEach(fill => {
                const pct = fill.getAttribute('data-pct');
                if (pct) (fill as HTMLElement).style.width = pct + '%';
            });
        }
        
    } catch (err) {
        console.error("Error al cargar analíticas:", err);
    }
}

function renderChart(chartData: any[]) {
    const ctx = document.getElementById('salesChart');
    if (!ctx) return;
    
    // Preparar etiquetas (fechas) y datos (totales)
    // Si no hay datos, mostrar 7 días vacíos
    const labels: string[] = [];
    const totals: number[] = [];
    
    // Asegurar 7 días
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        
        labels.push(d.toLocaleDateString('es-VE', { weekday: 'short', day: 'numeric' }));
        
        const dayData = chartData.find((c: any) => c.date === dateStr);
        totals.push(dayData ? parseFloat(dayData.total) : 0);
    }

    if (salesChartInstance) {
        salesChartInstance.destroy();
    }
    
    if (typeof Chart === 'undefined') return;

    salesChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Ingresos (Bs)',
                data: totals,
                borderColor: '#4F46E5',
                backgroundColor: 'rgba(79, 70, 229, 0.15)',
                borderWidth: 3,
                pointBackgroundColor: '#06B6D4',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointRadius: 5,
                pointHoverRadius: 7,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15, 22, 42, 0.9)',
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: false,
                    callbacks: {
                        label: function(context: any) {
                            return 'Bs ' + context.parsed.y.toLocaleString('es-VE');
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false, drawBorder: false },
                    ticks: { color: 'rgba(255,255,255,0.5)', font: { family: 'Inter' } }
                },
                y: {
                    grid: { color: 'rgba(255,255,255,0.05)', drawBorder: false },
                    ticks: {
                        color: 'rgba(255,255,255,0.5)',
                        font: { family: 'Inter' },
                        callback: function(value: any) {
                            return 'Bs ' + value.toLocaleString('es-VE');
                        }
                    },
                    beginAtZero: true
                }
            }
        }
    });
}

function renderSales() {
    const tableSales = document.getElementById('table-all-sales');
    const salesTotalSpan = document.getElementById('sales-total-amount');

    const totalAmount = salesList.reduce((sum, s) => sum + (parseFloat(s.monto) || 0), 0);
    if (salesTotalSpan) {
        salesTotalSpan.textContent = `(Total Facturado: $${totalAmount.toFixed(2)})`;
    }

    if (!tableSales) return;

    let filteredSales = salesList;
    if (salesSearchQuery) {
        const q = salesSearchQuery.toLowerCase();
        filteredSales = filteredSales.filter(s => 
            (s.client_name && s.client_name.toLowerCase().includes(q)) ||
            (s.order_id && s.order_id.toLowerCase().includes(q)) ||
            (s.client_phone && s.client_phone.toLowerCase().includes(q)) ||
            (s.metodo_pago && s.metodo_pago.toLowerCase().includes(q))
        );
    }

    if (filteredSales.length === 0) {
        tableSales.innerHTML = `<tr><td colspan="7" class="table-empty-message">${salesSearchQuery ? 'No se encontraron ventas que coincidan con la búsqueda.' : 'No se han registrado ventas completadas todavía.'}</td></tr>`;
        return;
    }

    tableSales.innerHTML = filteredSales.map(s => {
        const dateObj = new Date(s.fecha);
        const dateString = dateObj.toLocaleDateString('es-VE', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        const montoVal = parseFloat(s.monto) || 0.0;

        return `
            <tr>
                <td><strong>#V-${escapeHtml(s.id)}</strong></td>
                <td><code class="table-code-highlight">${escapeHtml(s.order_id)}</code></td>
                <td>${escapeHtml(s.client_name)}</td>
                <td>${escapeHtml(s.client_phone)}</td>
                <td class="table-amount-success">$${montoVal.toFixed(2)}</td>
                <td><span class="table-badge-payment">${escapeHtml(s.metodo_pago)}</span></td>
                <td class="table-text-secondary">${dateString}</td>
            </tr>
        `;
    }).join('');

    if (window.lucide) lucide.createIcons();
}

// --- RENDER DE MÉTRICAS ---
function renderMetrics() {
    const metricProdCount = document.getElementById('metric-prod-count');
    if (metricProdCount) metricProdCount.textContent = String(productsTotalCount || productsList.length);

    const pendingOrders = ordersList.filter(o => o.status === 'pendiente');
    const prodOrders = ordersList.filter(o => o.status === 'en_produccion');
    
    const metricPending = document.getElementById('metric-pending-orders');
    if (metricPending) metricPending.textContent = String(pendingOrders.length);

    const metricProd = document.getElementById('metric-prod-orders');
    if (metricProd) metricProd.textContent = String(prodOrders.length);

    const metricSalesCount = document.getElementById('metric-sales-count');
    
    if (metricSalesCount) {
        metricSalesCount.textContent = String(salesTotalCount || salesList.length);
    }
    
    // Actualizar badge del sidebar
    const badgeOrders = document.getElementById('sidebar-badge-orders');
    if (badgeOrders) {
        badgeOrders.textContent = String(pendingOrders.length);
        badgeOrders.classList.toggle('visible', pendingOrders.length > 0);
    }
}

// --- CONTROL Y RENDER DE PEDIDOS ---

function renderOrders() {
    const tableAll = document.getElementById('table-all-orders');
    const tableRecent = document.getElementById('table-recent-orders');

    const totalOrdersSum = ordersList.reduce((sum, o) => sum + (parseFloat(o.total_price) || 0), 0);
    const nonCancelledOrders = ordersList.filter(o => o.status !== 'cancelado');
    const activeOrdersSum = nonCancelledOrders.reduce((sum, o) => sum + (parseFloat(o.total_price) || 0), 0);

    const summarySpan = document.getElementById('orders-total-summary');
    if (summarySpan) {
        summarySpan.textContent = `(Monto Total: $${totalOrdersSum.toFixed(2)} | Activos: $${activeOrdersSum.toFixed(2)})`;
    }

    // Filtrar pedidos según búsqueda, estado y fecha
    let filteredOrders = ordersList;
    if (ordersStatusFilter) {
        filteredOrders = filteredOrders.filter(o => o.status === ordersStatusFilter);
    }
    if (ordersSearchQuery) {
        const q = ordersSearchQuery.toLowerCase();
        filteredOrders = filteredOrders.filter(o =>
            (o.id && o.id.toLowerCase().includes(q)) ||
            (o.client_name && o.client_name.toLowerCase().includes(q)) ||
            (o.client_phone && o.client_phone.toLowerCase().includes(q))
        );
    }
    if (ordersDateFilter && ordersDateFilter !== 'all') {
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const startOfYesterday = startOfToday - (24 * 60 * 60 * 1000);
        const startOf7Days = startOfToday - (7 * 24 * 60 * 60 * 1000);
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

        filteredOrders = filteredOrders.filter(o => {
            if (!o.created_at) return false;
            const orderTime = new Date(o.created_at).getTime();
            if (isNaN(orderTime)) return true;

            if (ordersDateFilter === 'today') {
                return orderTime >= startOfToday;
            } else if (ordersDateFilter === 'yesterday') {
                return orderTime >= startOfYesterday && orderTime < startOfToday;
            } else if (ordersDateFilter === 'last7') {
                return orderTime >= startOf7Days;
            } else if (ordersDateFilter === 'this_month') {
                return orderTime >= startOfMonth;
            }
            return true;
        });
    }

    // 1. Render en tabla general
    if (tableAll) {
        const hasFilters = ordersSearchQuery || ordersStatusFilter || (ordersDateFilter && ordersDateFilter !== 'all');
        if (filteredOrders.length === 0) {
            tableAll.innerHTML = `<tr><td colspan="7" class="table-empty-message">${hasFilters ? 'No hay pedidos que coincidan con los filtros aplicados.' : 'No hay pedidos en la base de datos.'}</td></tr>`;
        } else {
            tableAll.innerHTML = filteredOrders.map(o => createOrderRowMarkup(o)).join('');
        }
    }

    // 2. Render en tabla recientes (máximo 5)
    if (tableRecent) {
        if (ordersList.length === 0) {
            tableRecent.innerHTML = `<tr><td colspan="7" class="table-empty-message">No hay pedidos recientes.</td></tr>`;
        } else {
            const recent = ordersList.slice(0, 5);
            tableRecent.innerHTML = recent.map(o => createOrderRowMarkup(o, false)).join('');
        }
    }

    if (window.lucide) lucide.createIcons();
}

function createOrderRowMarkup(order: any, includeStatusSelector: boolean = true) {
    const dateObj = new Date(order.created_at);
    const dateString = dateObj.toLocaleDateString('es-VE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

    const priceText = order.total_price > 0 ? `$${parseFloat(order.total_price).toFixed(2)}` : '$0.00';
    
    let statusSelector = '';
    if (includeStatusSelector) {
        statusSelector = `
            <select class="status-select" data-action="status-select" data-id="${escapeHtml(order.id)}">
                <option value="pendiente" ${order.status === 'pendiente' ? 'selected' : ''}>Pendiente</option>
                <option value="en_produccion" ${order.status === 'en_produccion' ? 'selected' : ''}>En Preparación</option>
                <option value="listo_entrega" ${order.status === 'listo_entrega' ? 'selected' : ''}>Listo para Entrega</option>
                <option value="completado" ${order.status === 'completado' ? 'selected' : ''}>Completado</option>
                <option value="cancelado" ${order.status === 'cancelado' ? 'selected' : ''}>Cancelado</option>
            </select>
        `;
    } else {
        statusSelector = `<span class="status-badge ${escapeHtml(order.status)}">${escapeHtml(order.status).replace('_', ' ')}</span>`;
    }

        const hasReceipt = Boolean(order.payment_receipt);
        const receiptBadge = hasReceipt ? ' <span title="Comprobante de pago adjunto" class="table-receipt-badge">📸</span>' : '';
        return `
        <tr>
            <td><strong>#${escapeHtml(order.id)}</strong>${receiptBadge}</td>
            <td>${escapeHtml(order.client_name)}</td>
            <td>${escapeHtml(order.client_phone)}</td>
            <td>${escapeHtml(order.total_items)}</td>
            <td class="table-code-highlight">${priceText}</td>
            <td class="table-text-xs-secondary">${dateString}</td>
            <td>${statusSelector}</td>
            <td>
                <div class="table-actions-group">
                    <button class="action-icon-btn edit" data-action="view-order" data-id="${escapeHtml(order.id)}" title="Ver Detalles">
                        <i data-lucide="eye" class="table-action-icon"></i>
                    </button>
                    <button class="action-icon-btn delete" data-action="delete-order" data-id="${escapeHtml(order.id)}" title="Eliminar Pedido">
                        <i data-lucide="trash-2" class="table-action-icon"></i>
                    </button>
                </div>
            </td>
        </tr>
    `;
}

// Actualizar estado de un pedido (Invocado desde onchange en la tabla)
async function updateOrderStatus(orderId: string, newStatus: string) {
    try {
        if (newStatus === 'completado') {
            openPaymentModal(orderId, newStatus);
            return;
        }

        const response = await fetch('/api/orders', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: orderId, status: newStatus, paymentMethod: null })
        });

        if (!response.ok) throw new Error('Error al actualizar estado');
        const resData = await response.json();
        
        showToast(`Pedido #${orderId} actualizado a "${newStatus.replace('_', ' ')}"`, 'success');

        if (resData && (resData as any).whatsappNotificationUrl) {
            const shouldNotify = confirm(`¿Deseas abrir WhatsApp para notificar al cliente sobre el cambio a "${newStatus.replace('_', ' ')}"?`);
            if (shouldNotify) {
                window.open((resData as any).whatsappNotificationUrl, '_blank');
            }
        }
        refreshAllData();
    } catch (err) {
        console.error(err);
        showToast('Error al actualizar el estado del pedido.', 'error');
    }
}

// Eliminar un pedido
async function deleteOrder(orderId: string) {
    if (!confirm(`¿Estás completamente seguro de eliminar el pedido #${orderId}? Esta acción borrará todos sus detalles permanentemente.`)) {
        return;
    }

    try {
        const response = await fetch(`/api/orders?id=${encodeURIComponent(orderId)}`, {
            method: 'DELETE'
        });

        if (!response.ok) throw new Error('Error al eliminar');

        showToast(`Pedido #${orderId} eliminado con éxito del sistema.`, 'info');
        refreshAllData();
    } catch (err) {
        console.error(err);
        showToast('Error al eliminar el pedido.', 'error');
    }
}

// Ver detalles del pedido en Modal (Sanitizado contra XSS)
async function viewOrderDetails(orderId: string) {
    try {
        const res = await fetch(`/api/orders?id=${encodeURIComponent(orderId)}`);
        if (!res.ok) throw new Error('Error al obtener detalles');
        const order = (await res.json()) as any;

        // Rellenar modal mediante textContent para seguridad total
        const titleElem = document.getElementById('modal-order-title');
        if (titleElem) titleElem.textContent = `Detalles del Pedido #${order.id}`;

        const clientNameElem = document.getElementById('modal-client-name');
        if (clientNameElem) clientNameElem.textContent = order.client_name;

        const clientPhoneElem = document.getElementById('modal-client-phone');
        if (clientPhoneElem) clientPhoneElem.textContent = order.client_phone;
        
        const dateObj = new Date(order.created_at);
        const orderDateElem = document.getElementById('modal-order-date');
        if (orderDateElem) orderDateElem.textContent = dateObj.toLocaleString('es-VE');

        // Badge de estado
        const statusBadge = document.getElementById('modal-order-status');
        if (statusBadge) {
            statusBadge.className = `status-badge ${order.status}`;
            statusBadge.textContent = (order.status || '').replace('_', ' ');
        }

        // Total del Pedido
        const totalVal = parseFloat(order.total_price) || 0.0;
        const totalText = totalVal > 0 ? `$${totalVal.toFixed(2)}` : '$0.00';
        const totalElement = document.getElementById('modal-order-total');
        if (totalElement) {
            totalElement.textContent = totalText;
        }

        const bcvRateUsed = parseFloat(order.bcv_rate) || currentBcvRate;
        const totalBsVal = parseFloat(order.total_bs) || (totalVal * bcvRateUsed);
        const totalBsElement = document.getElementById('modal-order-total-bs');
        if (totalBsElement) {
            totalBsElement.textContent = `≈ Bs. ${totalBsVal.toFixed(2)} (Tasa: ${bcvRateUsed.toFixed(2)} Bs/$)`;
        }

        // Comprobante de Pago Adjunto
        const receiptContainer = document.getElementById('modal-receipt-container');
        const receiptThumb = document.getElementById('modal-receipt-thumb');
        const receiptDownloadBtn = document.getElementById('receipt-download-btn');
        const receiptModalImg = document.getElementById('receipt-modal-img');

        if (order.payment_receipt) {
            if (receiptContainer) receiptContainer.classList.remove('d-none');
            if (receiptThumb) (receiptThumb as HTMLImageElement).src = order.payment_receipt;
            if (receiptDownloadBtn) (receiptDownloadBtn as HTMLAnchorElement).href = order.payment_receipt;
            if (receiptModalImg) (receiptModalImg as HTMLImageElement).src = order.payment_receipt;
        } else {
            if (receiptContainer) receiptContainer.classList.add('d-none');
        }

        // Información de Delivery
        const deliveryTypeElem = document.getElementById('modal-delivery-type');
        const deliveryAddressContainer = document.getElementById('modal-delivery-address-container');
        const deliveryAddressElem = document.getElementById('modal-delivery-address');
        const deliveryNotesContainer = document.getElementById('modal-delivery-notes-container');
        const deliveryNotesElem = document.getElementById('modal-delivery-notes');

        if (deliveryTypeElem) {
            const isDelivery = order.delivery_type === 'delivery';
            deliveryTypeElem.textContent = isDelivery ? '🛵 Delivery a Domicilio' : '🏪 Retiro en Local';
            
            if (isDelivery) {
                if (deliveryAddressContainer) deliveryAddressContainer.classList.remove('d-none');
                if (deliveryAddressElem) deliveryAddressElem.textContent = order.delivery_address || 'No especificada';
                
                if (order.delivery_notes) {
                    if (deliveryNotesContainer) deliveryNotesContainer.classList.remove('d-none');
                    if (deliveryNotesElem) deliveryNotesElem.textContent = order.delivery_notes;
                } else {
                    if (deliveryNotesContainer) deliveryNotesContainer.classList.add('d-none');
                }
            } else {
                if (deliveryAddressContainer) deliveryAddressContainer.classList.add('d-none');
                if (deliveryNotesContainer) deliveryNotesContainer.classList.add('d-none');
            }
        }

        // Información de Pago
        const paymentMethodElem = document.getElementById('modal-payment-method');
        const paymentRefElem = document.getElementById('modal-payment-reference');
        const paymentLabels = {
            pago_movil: '📱 Pago Móvil',
            zelle: '🇺🇸 Zelle',
            efectivo: '💵 Efectivo',
            punto: '💳 Punto de Venta'
        };

        if (paymentMethodElem) {
            let label = paymentLabels[order.payment_method];
            if (!label && order.payment_method?.startsWith('pago_movil:')) {
                label = `Pago Móvil (${order.payment_method.replace('pago_movil:', '').trim()})`;
            }
            paymentMethodElem.textContent = label || order.payment_method || 'Por acordar';
        }
        if (paymentRefElem) {
            paymentRefElem.textContent = order.payment_reference || 'Sin referencia registrada';
        }

        // Items del pedido usando unit_price real guardado en DB
        const itemsList = document.getElementById('modal-items-list');
        if (itemsList) {
            if (!order.items || order.items.length === 0) {
                itemsList.innerHTML = `<p class="table-empty-message">No hay detalles de productos registrados.</p>`;
            } else {
                itemsList.innerHTML = order.items.map((item: any) => {
                    const sizeText = item.size ? ` [${escapeHtml(item.size)}]` : '';
                    const unitPrice = parseFloat(item.unit_price) || 0.0;
                    const subtotal = unitPrice * item.quantity;

                    return `
                        <div class="detail-item items-center">
                            <div class="detail-item-info">
                                <div class="detail-item-icon">
                                    <i data-lucide="utensils"></i>
                                </div>
                                <div class="detail-item-name">
                                    <h4>${escapeHtml(item.product_name)}</h4>
                                    <span>ID: ${escapeHtml(item.product_id)}${sizeText}</span>
                                </div>
                            </div>
                            <div class="order-detail-qty-col">
                                <div class="detail-item-qty order-detail-qty-val">
                                    x${item.quantity}
                                </div>
                                <div class="order-detail-unit-price">
                                    Precio: ${unitPrice.toFixed(2)}
                                </div>
                                <div class="order-detail-subtotal">
                                    Subtotal: ${subtotal.toFixed(2)}
                                </div>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        }

        // Configurar botón de chatear inteligente según el estado del pedido
        const btnChat = document.getElementById('btn-modal-chat') as HTMLAnchorElement | null;
        if (btnChat) {
            let cleanPhone = String(order.client_phone || '').replace(/[^\d]/g, '');
            if (cleanPhone.startsWith('0')) {
                cleanPhone = '58' + cleanPhone.slice(1);
            } else if (cleanPhone.length === 10 && !cleanPhone.startsWith('58')) {
                cleanPhone = '58' + cleanPhone;
            }
            const businessName = $val('cfg-business-name') || 'nuestra tienda';
            
            let message = `¡Hola ${order.client_name}! Te contactamos de *${businessName}* con respecto a tu pedido *#${order.id}*...`;
            if (order.status === 'pendiente') {
                message = `¡Hola ${order.client_name}! Te saludamos de *${businessName}*. Recibimos tu pedido *#${order.id}* por un monto total de *${totalText}*. ¿Deseas acordar el método de pago o requieres nuestros datos bancarios?`;
            } else if (order.status === 'en_produccion') {
                message = `¡Hola ${order.client_name}! Te notificamos de *${businessName}* que tu pedido *#${order.id}* ya está en preparación 👨‍🍳. Te avisaremos apenas esté listo.`;
            } else if (order.status === 'listo_entrega') {
                message = order.delivery_type === 'delivery'
                    ? `¡Hola ${order.client_name}! 🛵 Tu pedido *#${order.id}* de *${businessName}* ya está listo y va en camino a tu dirección (${order.delivery_address || 'acordada'}). ¡Pronto estará contigo!`
                    : `¡Hola ${order.client_name}! 🛍️ Tu pedido *#${order.id}* de *${businessName}* ya está listo para ser retirado en nuestro local. ¡Te esperamos!`;
            } else if (order.status === 'completado') {
                message = `¡Hola ${order.client_name}! 🎉 Muchas gracias por tu compra en *${businessName}*. Tu pedido *#${order.id}* ha sido completado con éxito. ¡Esperamos que disfrutes tu pedido y que vuelvas pronto!`;
            } else if (order.status === 'cancelado') {
                message = `Hola ${order.client_name}, te escribimos de *${businessName}* respecto a tu pedido *#${order.id}*, el cual figura como cancelado. Si tienes alguna consulta o deseas reprogramarlo, estamos a tu total disposición.`;
            }

            btnChat.href = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
        }

        orderModal?.classList.add('active');
        if (window.lucide) lucide.createIcons();
    } catch (err) {
        console.error(err);
        showToast('Error al obtener los detalles del pedido.', 'error');
    }
}

// Cerrar Modal
function closeModal() {
    if (orderModal) orderModal.classList.remove('active');
}
if (btnCloseModal) btnCloseModal.addEventListener('click', closeModal);
if (btnCloseModalFooter) btnCloseModalFooter.addEventListener('click', closeModal);
if (orderModal) {
    orderModal.addEventListener('click', (e) => {
        if (e.target === orderModal) closeModal();
    });
}

// --- LÓGICA DEL MODAL DE PAGO ---
function openPaymentModal(orderId: string, newStatus: string) {
    pendingPaymentOrderId = orderId;
    pendingPaymentStatus = newStatus;
    if (paymentModalOrderId) {
        paymentModalOrderId.textContent = `#${orderId}`;
    }
    
    const targetOrder = ordersList.find(o => o.id === orderId);
    const amountInput = document.getElementById('payment-amount');
    if (amountInput && targetOrder) {
        (amountInput as HTMLInputElement).value = parseFloat(targetOrder.total_price || 0).toFixed(2);
    }

    if (paymentMethodSelect && targetOrder?.payment_method) {
        paymentMethodSelect.value = targetOrder.payment_method.startsWith('pago_movil') ? 'pago_movil' : targetOrder.payment_method;
    }
    if (paymentReferenceInput) {
        paymentReferenceInput.value = targetOrder?.payment_reference || '';
    }

    // Comprobante de pago integrado en el modal de cobro
    const receiptBox = document.getElementById('payment-receipt-preview-box');
    const receiptThumb = document.getElementById('payment-receipt-preview-thumb') as HTMLImageElement | null;
    const btnViewReceipt = document.getElementById('btn-view-payment-receipt');

    if (targetOrder?.payment_receipt) {
        if (receiptBox) receiptBox.classList.remove('d-none');
        if (receiptThumb) receiptThumb.src = targetOrder.payment_receipt;
        
        const openReceiptViewer = (e: Event) => {
            e.preventDefault();
            const receiptModal = document.getElementById('receipt-modal');
            const receiptModalImg = document.getElementById('receipt-modal-img') as HTMLImageElement | null;
            const receiptDownloadBtn = document.getElementById('receipt-download-btn') as HTMLAnchorElement | null;
            if (receiptModalImg) receiptModalImg.src = targetOrder.payment_receipt;
            if (receiptDownloadBtn) receiptDownloadBtn.href = targetOrder.payment_receipt;
            if (receiptModal) receiptModal.classList.add('active');
        };

        if (btnViewReceipt) btnViewReceipt.onclick = openReceiptViewer;
        if (receiptThumb) receiptThumb.onclick = openReceiptViewer;
    } else {
        if (receiptBox) receiptBox.classList.add('d-none');
    }
    
    if (paymentModal) {
        paymentModal.classList.add('active');
    }
    if (window.lucide) lucide.createIcons();
}

function closePaymentModal() {
    if (paymentModal) {
        paymentModal.classList.remove('active');
    }
    const receiptBox = document.getElementById('payment-receipt-preview-box');
    if (receiptBox) receiptBox.classList.add('d-none');

    pendingPaymentOrderId = null;
    pendingPaymentStatus = null;
    refreshAllData();
}

if (btnClosePaymentModal) btnClosePaymentModal.addEventListener('click', closePaymentModal);
if (btnCancelPaymentModal) btnCancelPaymentModal.addEventListener('click', closePaymentModal);
if (paymentModal) {
    paymentModal.addEventListener('click', (e) => {
        if (e.target === paymentModal) closePaymentModal();
    });
}

if (paymentForm) {
    paymentForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const method = paymentMethodSelect ? paymentMethodSelect.value : "pago_movil";
        const ref = paymentReferenceInput ? paymentReferenceInput.value.trim() : "";
        const paymentMethodString = ref ? `${method} (Ref: ${ref})` : method;
        
        const orderId = pendingPaymentOrderId;
        const status = pendingPaymentStatus;
        
        const btnConfirm = $btn('btn-confirm-payment');
        const originalHTML = btnConfirm ? btnConfirm.innerHTML : '';
        if (btnConfirm) {
            btnConfirm.disabled = true;
            btnConfirm.innerHTML = '<i data-lucide="loader" class="spin"></i> Procesando...';
            if (window.lucide) lucide.createIcons();
        }
        
        const paymentAmountVal = parseFloat($val('payment-amount'));
        const payload: any = { id: orderId, status: status, paymentMethod: paymentMethodString };
        if (!isNaN(paymentAmountVal) && paymentAmountVal >= 0) {
            payload.paymentAmount = paymentAmountVal;
        }
        
        try {
            const response = await fetch('/api/orders', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) throw new Error('Error al actualizar estado');
            
            const resData = await response.json().catch(() => null);
            showToast(`Pedido #${orderId} completado y venta registrada.`, 'success');
            
            if (paymentModal) {
                paymentModal.classList.remove('active');
            }
            const receiptBox = document.getElementById('payment-receipt-preview-box');
            if (receiptBox) receiptBox.classList.add('d-none');

            pendingPaymentOrderId = null;
            pendingPaymentStatus = null;

            if (resData && (resData as any).whatsappNotificationUrl) {
                const shouldNotify = confirm(`¿Deseas abrir WhatsApp para enviar la confirmación de pago al cliente?`);
                if (shouldNotify) {
                    window.open((resData as any).whatsappNotificationUrl, '_blank');
                }
            }
            
            await refreshAllData();
        } catch (err) {
            console.error(err);
            showToast('Error al registrar el pago del pedido.', 'error');
        } finally {
            if (btnConfirm) {
                btnConfirm.disabled = false;
                btnConfirm.innerHTML = originalHTML;
                if (window.lucide) lucide.createIcons();
            }
        }
    });
}

// --- GESTIÓN DE PRODUCTOS (CRUD INVENTARIO / CATÁLOGO MULTI-PLANTILLA) ---

let activeProductTemplateFilter = 'all';

const templateDefaultCategory = {
    restaurant: 'principales',
    hardware: 'herramientas-electricas',
    autoparts: 'frenos',
    fashion: 'vestidos',
    tech: 'laptops-pc'
};

const templateBadges = {
    restaurant: '<span class="template-badge restaurant">🍽️ Restaurante</span>',
    hardware: '<span class="template-badge hardware">🔨 Ferretería</span>',
    autoparts: '<span class="template-badge autoparts">🚗 Repuestos</span>',
    fashion: '<span class="template-badge fashion">👗 Moda</span>',
    tech: '<span class="template-badge tech">⚡ Tecnología</span>'
};

function renderProductsTable() {
    const tableProducts = document.getElementById('table-products');
    if (!tableProducts) return;

    // Actualizar contadores de las pestañas de plantilla
    const countAll = document.getElementById('count-all');
    const countRest = document.getElementById('count-restaurant');
    const countHard = document.getElementById('count-hardware');
    const countFash = document.getElementById('count-fashion');
    const countTech = document.getElementById('count-tech');
    const countAuto = document.getElementById('count-autoparts');

    if (countAll) countAll.textContent = String(productsList.length);
    if (countRest) countRest.textContent = String(productsList.filter(p => (p.template || 'restaurant') === 'restaurant').length);
    if (countHard) countHard.textContent = String(productsList.filter(p => p.template === 'hardware').length);
    if (countFash) countFash.textContent = String(productsList.filter(p => p.template === 'fashion').length);
    if (countTech) countTech.textContent = String(productsList.filter(p => p.template === 'tech').length);
    if (countAuto) countAuto.textContent = String(productsList.filter(p => p.template === 'autoparts').length);

    // Actualizar contadores de stock
    const stockCountAll = document.getElementById('stock-count-all');
    const stockCountCritical = document.getElementById('stock-count-critical');
    const stockCountOut = document.getElementById('stock-count-out');
    const stockCountAvailable = document.getElementById('stock-count-available');

    if (stockCountAll) stockCountAll.textContent = String(productsList.length);
    if (stockCountCritical) stockCountCritical.textContent = String(productsList.filter(p => p.stock !== undefined && p.stock !== null && p.stock > 0 && p.stock <= 3).length);
    if (stockCountOut) stockCountOut.textContent = String(productsList.filter(p => (p.stock !== undefined && p.stock !== null && p.stock === 0) || p.active === 0).length);
    if (stockCountAvailable) stockCountAvailable.textContent = String(productsList.filter(p => (p.stock === -1 || p.stock === undefined || p.stock === null || p.stock > 3) && p.active !== 0).length);

    // Filtrar lista según plantilla activa
    let filteredProducts = activeProductTemplateFilter === 'all'
        ? productsList
        : productsList.filter(p => (p.template || 'restaurant') === activeProductTemplateFilter);

    // Filtrar lista según nivel de stock activo
    if (activeStockFilter === 'critical') {
        filteredProducts = filteredProducts.filter(p => p.stock !== undefined && p.stock !== null && p.stock > 0 && p.stock <= 3);
    } else if (activeStockFilter === 'out_of_stock') {
        filteredProducts = filteredProducts.filter(p => (p.stock !== undefined && p.stock !== null && p.stock === 0) || p.active === 0);
    } else if (activeStockFilter === 'available') {
        filteredProducts = filteredProducts.filter(p => (p.stock === -1 || p.stock === undefined || p.stock === null || p.stock > 3) && p.active !== 0);
    }

    if (productsSearchQuery) {
        const q = productsSearchQuery.toLowerCase();
        filteredProducts = filteredProducts.filter(p =>
            (p.name && p.name.toLowerCase().includes(q)) ||
            (p.id && p.id.toLowerCase().includes(q)) ||
            (p.sku && p.sku.toLowerCase().includes(q)) ||
            (p.category && p.category.toLowerCase().includes(q))
        );
    }

    // Actualizar estado del checkbox maestro
    const checkAll = document.getElementById('check-all-products') as HTMLInputElement | null;
    if (checkAll) {
        const allChecked = filteredProducts.length > 0 && filteredProducts.every(p => selectedProductIds.has(p.id));
        const someChecked = filteredProducts.some(p => selectedProductIds.has(p.id));
        checkAll.checked = allChecked;
        checkAll.indeterminate = !allChecked && someChecked;
    }

    if (filteredProducts.length === 0) {
        const emptyMsg = productsSearchQuery
            ? 'No se encontraron productos que coincidan con la búsqueda.'
            : (activeStockFilter !== 'all' ? 'No hay productos en esta categoría de stock.' : 'No hay productos registrados en esta plantilla. Agrega uno nuevo arriba.');
        tableProducts.innerHTML = `<tr><td colspan="11" class="table-empty-message">${emptyMsg}</td></tr>`;
        return;
    }

    const promoBadgeLabels: Record<string, string> = {
        destacado: '⭐ Destacado',
        oferta: '🔥 Oferta',
        nuevo: '✨ Nuevo',
        liquidacion: '🏷️ Liquidación'
    };

    tableProducts.innerHTML = filteredProducts.map(p => {
        const sizesText = p.sizes || 'N/A';
        const priceNum = parseFloat(p.price) || 0;
        const comparePriceNum = parseFloat(p.compare_at_price) || 0;
        
        let priceHtml = `<span>$${priceNum.toFixed(2)}</span>`;
        if (comparePriceNum > priceNum && priceNum > 0) {
            const discountPct = Math.round(((comparePriceNum - priceNum) / comparePriceNum) * 100);
            priceHtml = `
                <div>
                    <strong>$${priceNum.toFixed(2)}</strong>
                    <span class="table-price-old">$${comparePriceNum.toFixed(2)}</span>
                    <span class="table-discount-badge">-${discountPct}%</span>
                </div>
            `;
        }

        const statusText = p.active === 1 ? 'Disponible' : 'Agotado';
        const statusClass = p.active === 1 ? 'completado' : 'cancelado';
        const categoryLabel = p.category || p.type_id || 'general';
        const tmpl = p.template || 'restaurant';
        const badge = templateBadges[tmpl] || `<span class="template-badge">${escapeHtml(tmpl)}</span>`;

        const stockVal = p.stock !== undefined && p.stock !== null ? p.stock : -1;
        let stockHtml = '';
        if (stockVal === -1) {
            stockHtml = '<span class="stock-badge ilimitado">♾️ Ilimitado</span>';
        } else if (stockVal <= 0 || p.active === 0) {
            stockHtml = '<span class="stock-badge agotado">0 (Agotado)</span>';
        } else if (stockVal <= 3) {
            stockHtml = `<span class="stock-badge critico">⚠️ ${stockVal} (Crítico)</span>`;
        } else {
            stockHtml = `<span class="stock-badge normal">${stockVal} disp.</span>`;
        }

        const isChecked = selectedProductIds.has(p.id);
        const promoBadgeHtml = p.badge && promoBadgeLabels[p.badge]
            ? `<span class="promo-badge ${escapeHtml(p.badge)}">${promoBadgeLabels[p.badge]}</span>`
            : '';

        return `
            <tr>
                <td class="table-check-col">
                    <input type="checkbox" class="table-checkbox product-row-check" data-id="${escapeHtml(p.id)}" ${isChecked ? 'checked' : ''} />
                </td>
                <td>
                    <img src="${escapeHtml((p.image_url && (p.image_url.startsWith('http') || p.image_url.startsWith('/'))) ? p.image_url : `/${p.image_url || 'assets/favicon.svg'}`)}" alt="${escapeHtml(p.name)}" onerror="this.onerror=null; this.src='/assets/favicon.svg';" class="table-product-thumb">
                </td>
                <td>
                    <code>${escapeHtml(p.id)}</code>
                    ${p.sku ? `<span class="table-sku">SKU: ${escapeHtml(p.sku)}</span>` : ''}
                </td>
                <td>
                    <strong>${escapeHtml(p.name)}</strong>
                    ${promoBadgeHtml}
                </td>
                <td>${badge}</td>
                <td><span class="table-badge-category">${escapeHtml(categoryLabel)}</span></td>
                <td>${priceHtml}</td>
                <td>${stockHtml}</td>
                <td class="table-text-secondary">${escapeHtml(sizesText)}</td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td>
                    <div class="table-actions-group">
                        <button class="action-icon-btn quick-edit" data-action="quick-edit-product" data-id="${escapeHtml(p.id)}" title="Edición Rápida (Precio y Stock)">
                            <i data-lucide="zap" class="table-action-icon"></i>
                        </button>
                        <button class="action-icon-btn duplicate" data-action="duplicate-product" data-id="${escapeHtml(p.id)}" title="Duplicar / Clonar Producto">
                            <i data-lucide="copy" class="table-action-icon"></i>
                        </button>
                        <button class="action-icon-btn copy" data-action="copy-product-link" data-id="${escapeHtml(p.id)}" data-name="${escapeHtml(p.name)}" title="Copiar enlace directo para WhatsApp o redes">
                            <i data-lucide="share-2" class="table-action-icon"></i>
                        </button>
                        <button class="action-icon-btn edit" data-action="edit-product" data-id="${escapeHtml(p.id)}" title="Editar Producto Completo">
                            <i data-lucide="edit-3" class="table-action-icon"></i>
                        </button>
                        <button class="action-icon-btn delete" data-action="delete-product" data-id="${escapeHtml(p.id)}" title="Eliminar Producto">
                            <i data-lucide="trash-2" class="table-action-icon"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    if (window.lucide) lucide.createIcons();
}

// Configurar pestañas de filtro por plantilla
function setupTemplateFilterTabs() {
    const tabsContainer = document.getElementById('template-filter-tabs');
    if (!tabsContainer) return;

    tabsContainer.addEventListener('click', (e) => {
        const target = e.target as HTMLElement | null;
        const btn = target?.closest('.filter-tab-btn');
        if (!btn) return;

        const filter = btn.getAttribute('data-filter');
        if (!filter) return;

        activeProductTemplateFilter = filter;
        tabsContainer.querySelectorAll('.filter-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        renderProductsTable();
    });
}
setupTemplateFilterTabs();

// Configurar pestañas de filtro rápido por nivel de stock
function setupStockFilterTabs() {
    const stockContainer = document.getElementById('stock-filter-tabs');
    if (!stockContainer) return;

    stockContainer.addEventListener('click', (e) => {
        const target = e.target as HTMLElement | null;
        const btn = target?.closest('.stock-filter-btn');
        if (!btn) return;

        const filter = btn.getAttribute('data-stock-filter');
        if (!filter) return;

        activeStockFilter = filter;
        stockContainer.querySelectorAll('.stock-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        renderProductsTable();
    });
}
setupStockFilterTabs();

// Cambio dinámico de categoría por defecto al cambiar plantilla en el formulario
const prodTemplateSelect = document.getElementById('prod-template');
if (prodTemplateSelect) {
    prodTemplateSelect.addEventListener('change', (e) => {
        const selectedTmpl = (e.target as HTMLSelectElement).value;
        const catSelect = $input('prod-category');
        if (catSelect && (templateDefaultCategory as any)[selectedTmpl]) {
            catSelect.value = (templateDefaultCategory as any)[selectedTmpl];
        }
    });
}

// Enviar formulario (Crear / Editar Producto)
if (productForm) {
    productForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const method = $val('prod-method') || 'POST';
        const id = $val('prod-id');
        const template = $val('prod-template') || 'restaurant';
        const name = $val('prod-name');
        const category = $val('prod-category');
        const price = parseFloat($val('prod-price')) || 0.0;
        const comparePriceVal = $val('prod-compare-price');
        const compare_at_price = comparePriceVal !== '' ? (parseFloat(comparePriceVal) || 0.0) : 0.0;
        const badge = $val('prod-badge') || '';
        const sku = $val('prod-sku') || '';
        const icon = $val('prod-icon');
        let image_url = $val('prod-image');
        const sizes = $val('prod-sizes');
        const brand = $val('prod-brand');
        const model = $val('prod-model');
        const stockInputVal = $val('prod-stock');
        const stock = stockInputVal !== '' ? parseInt(stockInputVal, 10) : -1;
        const active = parseInt($val('prod-active')) || 1;
        const description = $val('prod-description');
        
        const imageFile = ($input('prod-image-file')?.files || [])[0];

        const btnSave = $btn('btn-submit-product');
        if (btnSave) {
            btnSave.disabled = true;
            btnSave.innerHTML = '<i data-lucide="loader" class="spin"></i> Guardando...';
            if (window.lucide) lucide.createIcons();
        }

        try {
            // Subir imagen a R2 primero si hay archivo
            if (imageFile) {
                const formData = new FormData();
                formData.append("file", imageFile);
                const uploadRes = await fetch('/api/upload?type=product', { method: 'POST', body: formData });
                const uploadData = (await uploadRes.json()) as any;
                if (uploadRes.ok && uploadData.success) {
                    image_url = uploadData.url;
                } else {
                    throw new Error(uploadData.error || "Error al subir la imagen a R2");
                }
            }

            const response = await fetch('/api/products', {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id, name, template, category, price, icon, image_url, sizes: sizes || null, active, description,
                    brand: brand || null, model: model || null,
                    stock: isNaN(stock) ? -1 : stock,
                    compare_at_price,
                    badge,
                    sku
                })
            });

            const data = (await response.json()) as any;

            if (response.ok && data.success) {
                showToast(data.message || 'Producto guardado exitosamente.', 'success');
                resetProductForm();
                refreshAllData();
            } else {
                showToast(data.error || 'Error al guardar el producto.', 'error');
            }
        } catch (err) {
            console.error(err);
            showToast('Error de red al guardar producto.', 'error');
        } finally {
            if (btnSave) {
                btnSave.disabled = false;
                btnSave.innerHTML = '<i data-lucide="plus-circle"></i> Guardar Producto';
                if (window.lucide) lucide.createIcons();
            }
        }
    });
}

// Iniciar edición de un producto
function startEditProduct(productId: string) {
    const product = productsList.find(p => p.id === productId);
    if (!product) return;

    const imagePreviewEl = document.getElementById('prod-image-preview');

    setVal('prod-method', 'PUT');
    setVal('prod-id', product.id);
    const idIn = $input('prod-id'); if (idIn) idIn.disabled = true;
    setVal('prod-template', product.template || 'restaurant');
    setVal('prod-name', product.name);
    setVal('prod-category', product.category || product.type_id || 'principales');
    setVal('prod-price', product.price);
    setVal('prod-compare-price', product.compare_at_price ?? '');
    setVal('prod-badge', product.badge || '');
    setVal('prod-sku', product.sku || '');
    setVal('prod-icon', product.icon || '');
    
    setVal('prod-image', product.image_url || '');
    const imgFileIn = $input('prod-image-file'); if (imgFileIn) imgFileIn.value = ''; // Reset file input
    if (imagePreviewEl && product.image_url) {
        const url = (product.image_url.startsWith('http') || product.image_url.startsWith('/')) ? product.image_url : `/${product.image_url}`;
        imagePreviewEl.innerHTML = `<img src="${escapeHtml(url)}" alt="Vista previa" class="prod-thumb-img" />`;
        imagePreviewEl.classList.remove('d-none');
    } else if (imagePreviewEl) {
        imagePreviewEl.innerHTML = '';
        imagePreviewEl.classList.add('d-none');
    }

    setVal('prod-sizes', product.sizes || '');
    setVal('prod-stock', (product.stock !== undefined && product.stock !== null) ? product.stock : -1);
    setVal('prod-brand', product.brand || '');
    setVal('prod-model', product.model || '');
    setVal('prod-active', product.active !== undefined ? product.active : 1);
    setVal('prod-description', product.description || '');

    if (formProductTitle) formProductTitle.textContent = `Editando Producto: ${product.name}`;
    if (btnSubmitProduct) btnSubmitProduct.innerHTML = '<i data-lucide="save"></i> Actualizar Producto';
    if (btnCancelEdit) btnCancelEdit.classList.remove('d-none');
    
    if (window.lucide) lucide.createIcons();

    const collapseEl = document.getElementById('product-form-collapse');
    if (collapseEl && !collapseEl.classList.contains('expanded')) {
        collapseEl.classList.add('expanded');
    }

    if (formProductTitle) {
        formProductTitle.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

// Cancelar Edición
function resetProductForm() {
    if (productForm) productForm.reset();
    const imagePreviewEl = document.getElementById('prod-image-preview');
    
    setVal('prod-method', 'POST');
    const idInReset = $input('prod-id');
    if (idInReset) {
        idInReset.disabled = false;
        delete idInReset.dataset.manual;
    }
    setVal('prod-id', '');
    setVal('prod-template', 'restaurant');
    setVal('prod-stock', '-1');
    setVal('prod-compare-price', '');
    setVal('prod-badge', '');
    setVal('prod-sku', '');
    if (imagePreviewEl) {
        imagePreviewEl.innerHTML = '';
        imagePreviewEl.classList.add('d-none');
    }
    const ife = $input('prod-image-file'); if (ife) ife.value = '';
    
    if (formProductTitle) formProductTitle.textContent = 'Añadir Nuevo Producto';
    if (btnSubmitProduct) btnSubmitProduct.innerHTML = '<i data-lucide="plus-circle"></i> Guardar Producto';
    if (btnCancelEdit) btnCancelEdit.classList.add('d-none');
    if (window.lucide) lucide.createIcons();

    const collapseEl = document.getElementById('product-form-collapse');
    if (collapseEl && collapseEl.classList.contains('expanded')) {
        collapseEl.classList.remove('expanded');
    }
}

if (btnCancelEdit) btnCancelEdit.addEventListener('click', resetProductForm);

// Eliminar un producto
async function deleteProduct(productId: string) {
    if (!confirm(`¿Estás seguro de eliminar el producto "${productId}" del catálogo? Se borrará permanentemente de la base de datos.`)) {
        return;
    }

    try {
        const response = await fetch(`/api/products?id=${encodeURIComponent(productId)}`, {
            method: 'DELETE'
        });

        if (!response.ok) throw new Error('Error al eliminar');

        showToast('Producto eliminado del catálogo.', 'info');
        refreshAllData();
    } catch (err) {
        console.error(err);
        showToast('Error al intentar eliminar el producto.', 'error');
    }
}

// Duplicar / Clonar Producto
function duplicateProduct(productId: string) {
    const product = productsList.find(p => p.id === productId);
    if (!product) return;

    resetProductForm();

    setVal('prod-method', 'POST');
    const newId = `${product.id}-copia`;
    setVal('prod-id', newId);
    const idIn = $input('prod-id');
    if (idIn) {
        idIn.disabled = false;
        idIn.dataset.manual = 'true';
    }
    setVal('prod-name', `${product.name} (Copia)`);
    setVal('prod-template', product.template || 'restaurant');
    setVal('prod-category', product.category || product.type_id || 'principales');
    setVal('prod-price', product.price);
    setVal('prod-compare-price', product.compare_at_price ?? '');
    setVal('prod-badge', product.badge || '');
    setVal('prod-sku', product.sku ? `${product.sku}-COP` : '');
    setVal('prod-icon', product.icon || '');
    setVal('prod-image', product.image_url || '');
    setVal('prod-sizes', product.sizes || '');
    setVal('prod-stock', (product.stock !== undefined && product.stock !== null) ? product.stock : -1);
    setVal('prod-brand', product.brand || '');
    setVal('prod-model', product.model || '');
    setVal('prod-active', 1);
    setVal('prod-description', product.description || '');

    const imagePreviewEl = document.getElementById('prod-image-preview');
    if (imagePreviewEl && product.image_url) {
        const url = (product.image_url.startsWith('http') || product.image_url.startsWith('/')) ? product.image_url : `/${product.image_url}`;
        imagePreviewEl.innerHTML = `<img src="${escapeHtml(url)}" alt="Vista previa" class="prod-thumb-img" />`;
        imagePreviewEl.classList.remove('d-none');
    }

    if (formProductTitle) formProductTitle.textContent = `Duplicando: ${product.name}`;
    if (btnSubmitProduct) btnSubmitProduct.innerHTML = '<i data-lucide="copy"></i> Guardar Copia de Producto';
    if (btnCancelEdit) btnCancelEdit.classList.remove('d-none');
    if (window.lucide) lucide.createIcons();

    const collapseEl = document.getElementById('product-form-collapse');
    if (collapseEl && !collapseEl.classList.contains('expanded')) {
        collapseEl.classList.add('expanded');
    }

    if (formProductTitle) {
        formProductTitle.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    showToast(`Copia de "${product.name}" cargada en el formulario. Edita y guarda cuando estés listo.`, 'info');
}

// --- EDICIÓN RÁPIDA (QUICK EDIT) ---
function openQuickEditModal(productId: string) {
    const product = productsList.find(p => p.id === productId);
    if (!product) return;

    setVal('quick-edit-id', product.id);
    const titleEl = document.getElementById('quick-edit-title');
    if (titleEl) titleEl.textContent = `${product.name} (${product.id})`;
    setVal('quick-edit-price', product.price ?? 0);
    setVal('quick-edit-compare-price', product.compare_at_price ?? '');
    setVal('quick-edit-stock', product.stock !== undefined && product.stock !== null ? product.stock : -1);
    setVal('quick-edit-active', product.active !== undefined ? product.active : 1);

    const modal = document.getElementById('quick-edit-modal');
    if (modal) modal.classList.add('active');
}

function closeQuickEditModal() {
    const modal = document.getElementById('quick-edit-modal');
    if (modal) modal.classList.remove('active');
}

async function handleQuickEditSubmit() {
    const id = $val('quick-edit-id');
    const price = parseFloat($val('quick-edit-price')) || 0;
    const comparePriceVal = $val('quick-edit-compare-price');
    const compare_at_price = comparePriceVal !== '' ? (parseFloat(comparePriceVal) || 0) : 0;
    const stockVal = $val('quick-edit-stock');
    const stock = stockVal !== '' ? parseInt(stockVal, 10) : -1;
    const active = parseInt($val('quick-edit-active'), 10);

    const product = productsList.find(p => p.id === id);
    if (!product) return;

    const btnSave = document.getElementById('btn-save-quick-edit') as HTMLButtonElement | null;
    if (btnSave) {
        btnSave.disabled = true;
        btnSave.textContent = 'Guardando...';
    }

    try {
        const response = await fetch('/api/products', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...product,
                price,
                compare_at_price,
                stock: isNaN(stock) ? -1 : stock,
                active
            })
        });
        const resData = (await response.json()) as any;
        if (response.ok && resData.success) {
            showToast('Producto actualizado rápidamente.', 'success');
            closeQuickEditModal();
            refreshAllData();
        } else {
            showToast(resData.error || 'Error al actualizar producto.', 'error');
        }
    } catch (err) {
        console.error(err);
        showToast('Error de conexión al actualizar.', 'error');
    } finally {
        if (btnSave) {
            btnSave.disabled = false;
            btnSave.textContent = 'Guardar Cambios';
        }
    }
}

// Quick edit form submit listener & modal click outside
const quickEditForm = document.getElementById('quick-edit-form') as HTMLFormElement | null;
if (quickEditForm) {
    quickEditForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await handleQuickEditSubmit();
    });
}

const quickEditModal = document.getElementById('quick-edit-modal');
if (quickEditModal) {
    quickEditModal.addEventListener('click', (e) => {
        if (e.target === quickEditModal) {
            closeQuickEditModal();
        }
    });
}

// --- ACCIONES EN MASA (BULK ACTIONS) ---
function updateBulkToolbar() {
    const toolbar = document.getElementById('products-bulk-toolbar');
    const countBadge = document.getElementById('bulk-selected-count');
    if (!toolbar) return;

    const count = selectedProductIds.size;
    if (count > 0) {
        toolbar.classList.remove('d-none');
        if (countBadge) countBadge.textContent = `${count} ${count === 1 ? 'seleccionado' : 'seleccionados'}`;
    } else {
        toolbar.classList.add('d-none');
    }
}

function clearBulkSelection() {
    selectedProductIds.clear();
    const checkAll = document.getElementById('check-all-products') as HTMLInputElement | null;
    if (checkAll) {
        checkAll.checked = false;
        checkAll.indeterminate = false;
    }
    document.querySelectorAll<HTMLInputElement>('.product-row-check').forEach(cb => {
        cb.checked = false;
    });
    updateBulkToolbar();
}

async function handleBulkActivate(active: number) {
    if (selectedProductIds.size === 0) return;
    const actionLabel = active === 1 ? 'activar' : 'pausar / marcar como agotados';
    if (!confirm(`¿Deseas ${actionLabel} los ${selectedProductIds.size} productos seleccionados?`)) return;

    showToast(`Actualizando ${selectedProductIds.size} productos...`, 'info');
    let successCount = 0;
    for (const id of Array.from(selectedProductIds)) {
        const prod = productsList.find(p => p.id === id);
        if (!prod) continue;
        try {
            const res = await fetch('/api/products', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...prod, active })
            });
            if (res.ok) successCount++;
        } catch (e) {
            console.error(e);
        }
    }
    showToast(`${successCount} productos actualizados.`, 'success');
    clearBulkSelection();
    refreshAllData();
}

async function handleBulkPriceAdjust() {
    if (selectedProductIds.size === 0) return;
    const input = prompt(`Ajustar precios de los ${selectedProductIds.size} productos seleccionados:\nIngresa el porcentaje de cambio (ej: 10 para aumentar 10%, -15 para descontar 15%):`);
    if (input === null) return;
    const pct = parseFloat(input);
    if (isNaN(pct) || pct < -99 || pct > 500) {
        showToast('Porcentaje no válido. Debe ser entre -99% y +500%.', 'error');
        return;
    }

    if (!confirm(`¿Confirmas aplicar ${pct > 0 ? '+' : ''}${pct}% a los precios de los ${selectedProductIds.size} productos seleccionados?`)) return;

    showToast('Aplicando ajuste masivo de precios...', 'info');
    let successCount = 0;
    for (const id of Array.from(selectedProductIds)) {
        const prod = productsList.find(p => p.id === id);
        if (!prod) continue;
        const currentPrice = parseFloat(prod.price) || 0;
        const newPrice = Math.max(0.01, Math.round(currentPrice * (1 + pct / 100) * 100) / 100);
        try {
            const res = await fetch('/api/products', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...prod,
                    price: newPrice,
                    compare_at_price: currentPrice
                })
            });
            if (res.ok) successCount++;
        } catch (e) {
            console.error(e);
        }
    }
    showToast(`${successCount} precios actualizados correctamente.`, 'success');
    clearBulkSelection();
    refreshAllData();
}

async function handleBulkDelete() {
    if (selectedProductIds.size === 0) return;
    const count = selectedProductIds.size;
    if (!confirm(`⚠️ ATENCIÓN: ¿Estás seguro de eliminar permanentemente estos ${count} productos del catálogo? Esta acción no se puede deshacer.`)) return;

    showToast(`Eliminando ${count} productos...`, 'info');
    try {
        const idsArray = Array.from(selectedProductIds);
        const res = await fetch(`/api/products?ids=${encodeURIComponent(idsArray.join(','))}`, {
            method: 'DELETE'
        });
        const data = await res.json() as any;
        if (res.ok && data.success) {
            showToast(`${count} productos eliminados del catálogo.`, 'success');
        } else {
            showToast(data.error || 'Error al eliminar productos en lote.', 'error');
        }
    } catch (e) {
        console.error(e);
        showToast('Error de red al eliminar en lote.', 'error');
    } finally {
        clearBulkSelection();
        refreshAllData();
    }
}

// Listener global de selección múltiple (checkboxes)
document.addEventListener('change', (e) => {
    const target = e.target as HTMLInputElement | null;
    if (!target) return;

    if (target.id === 'check-all-products') {
        const rowChecks = document.querySelectorAll<HTMLInputElement>('.product-row-check');
        if (target.checked) {
            rowChecks.forEach(cb => {
                cb.checked = true;
                const id = cb.getAttribute('data-id');
                if (id) selectedProductIds.add(id);
            });
        } else {
            rowChecks.forEach(cb => {
                cb.checked = false;
                const id = cb.getAttribute('data-id');
                if (id) selectedProductIds.delete(id);
            });
        }
        updateBulkToolbar();
    } else if (target.classList.contains('product-row-check')) {
        const id = target.getAttribute('data-id');
        if (id) {
            if (target.checked) {
                selectedProductIds.add(id);
            } else {
                selectedProductIds.delete(id);
            }
        }
        const checkAll = document.getElementById('check-all-products') as HTMLInputElement | null;
        if (checkAll) {
            const rowChecks = Array.from(document.querySelectorAll<HTMLInputElement>('.product-row-check'));
            const allChecked = rowChecks.length > 0 && rowChecks.every(cb => cb.checked);
            const someChecked = rowChecks.some(cb => cb.checked);
            checkAll.checked = allChecked;
            checkAll.indeterminate = !allChecked && someChecked;
        }
        updateBulkToolbar();
    }
});

// --- GESTOR CENTRAL DE CATEGORÍAS DEL CATÁLOGO ---
interface CategoryItemData {
    id: string;
    name: string;
    icon?: string;
    count: number;
}

let categoriesDataList: CategoryItemData[] = [];

async function loadCategories() {
    try {
        const res = await fetch('/api/categories');
        if (!res.ok) throw new Error('Error al consultar categorías');
        const data = (await res.json()) as any;
        categoriesDataList = data.categories || [];
        renderCategoriesTable();
        updateCategoryDatalist();
    } catch (err) {
        console.error('Error cargando categorías:', err);
    }
}

// Poblar datalist de categorías de forma dinámica y sincronizada con el gestor
function updateCategoryDatalist() {
    const datalist = document.getElementById('category-datalist');
    if (!datalist) return;

    const seen = new Set<string>();
    const options: string[] = [];

    // 1. Categorías del Gestor Central
    if (categoriesDataList && categoriesDataList.length > 0) {
        categoriesDataList.forEach(c => {
            if (!seen.has(c.id)) {
                seen.add(c.id);
                options.push(`<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`);
            }
        });
    }

    // 2. Categorías predeterminadas sugeridas
    const defaults = [
        'entradas', 'principales', 'bebidas', 'postres', 'promociones',
        'herramientas-manuales', 'herramientas-electricas', 'seguridad', 'electricidad', 'construccion-pinturas',
        'vestidos', 'blusas-tops', 'pantalones-jeans', 'conjuntos', 'accesorios-calzado',
        'laptops-pc', 'componentes', 'perifericos', 'smartphones-tablets', 'accesorios-redes',
        'frenos', 'motor-partes', 'suspension-direccion', 'baterias-electricidad', 'accesorios-repuestos'
    ];
    defaults.forEach(c => {
        if (!seen.has(c)) {
            seen.add(c);
            options.push(`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`);
        }
    });

    // 3. Categorías existentes en productos cargados
    productsList.forEach(p => {
        if (p.category && typeof p.category === 'string' && p.category.trim() && !seen.has(p.category.trim())) {
            seen.add(p.category.trim());
            options.push(`<option value="${escapeHtml(p.category.trim())}">${escapeHtml(p.category.trim())}</option>`);
        }
    });

    datalist.innerHTML = options.join('');
}

function renderCategoriesTable() {
    const tbody = document.getElementById('table-categories-body');
    const badge = document.getElementById('categories-count-badge');
    if (badge) {
        badge.textContent = `${categoriesDataList.length} ${categoriesDataList.length === 1 ? 'categoría' : 'categorías'}`;
    }

    if (!tbody) return;

    if (categoriesDataList.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="table-empty-row">
                    No hay categorías registradas. ¡Crea la primera en el formulario superior!
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = categoriesDataList.map(cat => {
        const iconName = cat.icon || 'tag';
        const countClass = cat.count > 0 ? 'has-products' : 'zero-products';
        const countText = `${cat.count} ${cat.count === 1 ? 'producto' : 'productos'}`;

        return `
            <tr>
                <td>
                    <span class="category-slug-pill">
                        <i data-lucide="${escapeHtml(iconName)}" class="icon-14"></i>
                        ${escapeHtml(cat.id)}
                    </span>
                </td>
                <td>
                    <strong>${escapeHtml(cat.name)}</strong>
                </td>
                <td>
                    <span class="category-slug-pill">
                        ${escapeHtml(iconName)}
                    </span>
                </td>
                <td>
                    <span class="category-count-pill ${countClass}">
                        ${countText}
                    </span>
                </td>
                <td>
                    <div class="category-actions-cell">
                        <button
                            type="button"
                            class="btn-action secondary btn-icon-cell btn-trigger-rename-cat"
                            data-slug="${escapeHtml(cat.id)}"
                            data-name="${escapeHtml(cat.name)}"
                            data-icon="${escapeHtml(iconName)}"
                            title="Renombrar globalmente en productos"
                        >
                            <i data-lucide="edit-2" class="icon-14"></i> Renombrar
                        </button>
                        <button
                            type="button"
                            class="btn-action secondary btn-icon-cell btn-cat-delete btn-trigger-delete-cat"
                            data-slug="${escapeHtml(cat.id)}"
                            data-name="${escapeHtml(cat.name)}"
                            data-count="${cat.count}"
                            title="Eliminar o reasignar"
                        >
                            <i data-lucide="trash-2" class="icon-14"></i> Eliminar
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    if (window.lucide) lucide.createIcons();
}

function openCategoriesModal() {
    const modal = document.getElementById('categories-modal');
    if (modal) {
        modal.classList.add('active');
        loadCategories();
    }
}

function closeCategoriesModal() {
    const modal = document.getElementById('categories-modal');
    if (modal) modal.classList.remove('active');
}

function openRenameCategoryModal(slug: string, name: string, icon: string) {
    const modal = document.getElementById('category-rename-modal');
    if (!modal) return;

    const oldSlugInput = document.getElementById('rename-cat-old-slug') as HTMLInputElement | null;
    const currentDisplay = document.getElementById('rename-cat-current-display');
    const newSlugInput = document.getElementById('rename-cat-new-slug') as HTMLInputElement | null;
    const nameInput = document.getElementById('rename-cat-name') as HTMLInputElement | null;
    const iconInput = document.getElementById('rename-cat-icon') as HTMLInputElement | null;

    if (oldSlugInput) oldSlugInput.value = slug;
    if (currentDisplay) currentDisplay.textContent = slug;
    if (newSlugInput) newSlugInput.value = slug;
    if (nameInput) nameInput.value = name;
    if (iconInput) iconInput.value = icon || 'tag';

    modal.classList.add('active');
    if (nameInput) nameInput.focus();
}

function closeRenameCategoryModal() {
    const modal = document.getElementById('category-rename-modal');
    if (modal) modal.classList.remove('active');
}

function openDeleteCategoryModal(slug: string, name: string, count: number) {
    const modal = document.getElementById('category-delete-modal');
    if (!modal) return;

    const targetSlugInput = document.getElementById('delete-cat-target-slug') as HTMLInputElement | null;
    const warningText = document.getElementById('delete-cat-warning-text');
    const reassignContainer = document.getElementById('delete-cat-reassign-container');
    const reassignSelect = document.getElementById('delete-cat-reassign-select') as HTMLSelectElement | null;

    if (targetSlugInput) targetSlugInput.value = slug;

    if (count > 0) {
        if (warningText) {
            warningText.innerHTML = `La categoría <strong>"${escapeHtml(name)}"</strong> tiene <strong>${count}</strong> producto(s) asignado(s). Para eliminarla, selecciona la categoría de destino a la cual serán transferidos:`;
        }
        if (reassignContainer) reassignContainer.classList.remove('d-none');
        if (reassignSelect) {
            const otherCategories = categoriesDataList.filter(c => c.id !== slug);
            if (otherCategories.length > 0) {
                reassignSelect.innerHTML = otherCategories.map(c => 
                    `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)} (${c.id})</option>`
                ).join('');
            } else {
                reassignSelect.innerHTML = `<option value="general">General (Crear)</option>`;
            }
        }
    } else {
        if (warningText) {
            warningText.innerHTML = `¿Estás seguro de que deseas eliminar la categoría <strong>"${escapeHtml(name)}"</strong>?`;
        }
        if (reassignContainer) reassignContainer.classList.add('d-none');
    }

    modal.classList.add('active');
}

function closeDeleteCategoryModal() {
    const modal = document.getElementById('category-delete-modal');
    if (modal) modal.classList.remove('active');
}

// Auto-generación de slug en formulario de nueva categoría
const newCatNameIn = document.getElementById('new-cat-name') as HTMLInputElement | null;
const newCatSlugIn = document.getElementById('new-cat-slug') as HTMLInputElement | null;
if (newCatNameIn && newCatSlugIn) {
    newCatNameIn.addEventListener('input', () => {
        if (!newCatSlugIn.dataset.manual) {
            newCatSlugIn.value = newCatNameIn.value
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '');
        }
    });
    newCatSlugIn.addEventListener('input', () => {
        newCatSlugIn.dataset.manual = 'true';
    });
}

// Submit crear nueva categoría
const formNewCat = document.getElementById('form-new-category') as HTMLFormElement | null;
if (formNewCat) {
    formNewCat.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = (document.getElementById('new-cat-name') as HTMLInputElement)?.value.trim();
        const slug = (document.getElementById('new-cat-slug') as HTMLInputElement)?.value.trim().toLowerCase();
        const icon = (document.getElementById('new-cat-icon') as HTMLInputElement)?.value.trim() || 'tag';
        const submitBtn = document.getElementById('btn-submit-new-cat') as HTMLButtonElement | null;

        if (!name || !slug) return;

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i data-lucide="loader" class="spin"></i> Creando...';
            if (window.lucide) lucide.createIcons();
        }

        try {
            const res = await fetch('/api/categories', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: slug, name, icon })
            });
            const data = (await res.json()) as any;
            if (!res.ok) throw new Error(data.error || 'Error al crear categoría');

            showToast(data.message || 'Categoría creada con éxito.', 'success');
            formNewCat.reset();
            const slugIn = document.getElementById('new-cat-slug') as HTMLInputElement | null;
            if (slugIn) delete slugIn.dataset.manual;

            await loadCategories();
        } catch (err: any) {
            showToast(err.message || 'No se pudo crear la categoría.', 'error');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i data-lucide="plus"></i> Crear Categoría';
                if (window.lucide) lucide.createIcons();
            }
        }
    });
}

// Submit renombrar categoría globalmente
const formRenameCat = document.getElementById('form-rename-category') as HTMLFormElement | null;
if (formRenameCat) {
    formRenameCat.addEventListener('submit', async (e) => {
        e.preventDefault();
        const oldSlug = (document.getElementById('rename-cat-old-slug') as HTMLInputElement)?.value;
        const newSlug = (document.getElementById('rename-cat-new-slug') as HTMLInputElement)?.value.trim().toLowerCase();
        const name = (document.getElementById('rename-cat-name') as HTMLInputElement)?.value.trim();
        const icon = (document.getElementById('rename-cat-icon') as HTMLInputElement)?.value.trim();
        const submitBtn = document.getElementById('btn-submit-cat-rename') as HTMLButtonElement | null;

        if (!oldSlug || !newSlug || !name) return;

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i data-lucide="loader" class="spin"></i> Guardando...';
            if (window.lucide) lucide.createIcons();
        }

        try {
            const res = await fetch('/api/categories', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ oldCategory: oldSlug, newCategory: newSlug, name, icon })
            });
            const data = (await res.json()) as any;
            if (!res.ok) throw new Error(data.error || 'Error al renombrar categoría');

            showToast(data.message || 'Categoría renombrada con éxito.', 'success');
            closeRenameCategoryModal();
            await loadCategories();
            await loadProducts();
        } catch (err: any) {
            showToast(err.message || 'No se pudo renombrar la categoría.', 'error');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i data-lucide="check"></i> Guardar y Aplicar Globalmente';
                if (window.lucide) lucide.createIcons();
            }
        }
    });
}

// Submit eliminar / reasignar categoría
const formDeleteCat = document.getElementById('form-delete-category') as HTMLFormElement | null;
if (formDeleteCat) {
    formDeleteCat.addEventListener('submit', async (e) => {
        e.preventDefault();
        const slug = (document.getElementById('delete-cat-target-slug') as HTMLInputElement)?.value;
        const reassignSelect = document.getElementById('delete-cat-reassign-select') as HTMLSelectElement | null;
        const reassignTo = reassignSelect ? reassignSelect.value : undefined;
        const submitBtn = document.getElementById('btn-submit-cat-delete') as HTMLButtonElement | null;

        if (!slug) return;

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i data-lucide="loader" class="spin"></i> Eliminando...';
            if (window.lucide) lucide.createIcons();
        }

        try {
            const res = await fetch('/api/categories', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ category: slug, reassignTo })
            });
            const data = (await res.json()) as any;
            if (!res.ok) throw new Error(data.error || 'Error al eliminar categoría');

            showToast(data.message || 'Categoría eliminada.', 'success');
            closeDeleteCategoryModal();
            await loadCategories();
            await loadProducts();
        } catch (err: any) {
            showToast(err.message || 'No se pudo eliminar la categoría.', 'error');
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i data-lucide="trash-2"></i> Confirmar Eliminación';
                if (window.lucide) lucide.createIcons();
            }
        }
    });
}

// Cierre al hacer click en el backdrop de los modales
const catModal = document.getElementById('categories-modal');
if (catModal) {
    catModal.addEventListener('click', (e) => {
        if (e.target === catModal) closeCategoriesModal();
    });
}
const catRenameModal = document.getElementById('category-rename-modal');
if (catRenameModal) {
    catRenameModal.addEventListener('click', (e) => {
        if (e.target === catRenameModal) closeRenameCategoryModal();
    });
}
const catDeleteModal = document.getElementById('category-delete-modal');
if (catDeleteModal) {
    catDeleteModal.addEventListener('click', (e) => {
        if (e.target === catDeleteModal) closeDeleteCategoryModal();
    });
}

// Botón Nuevo Producto (Toggle formulario)
if (btnToggleProductForm) {
    btnToggleProductForm.addEventListener('click', () => {
        const collapseEl = document.getElementById('product-form-collapse');
        if (collapseEl) {
            collapseEl.classList.toggle('expanded');
            if (collapseEl.classList.contains('expanded')) {
                document.getElementById('prod-template')?.focus();
            }
        }
    });
}

// Auto-generación de slug para productos desde el nombre
const prodNameInput = document.getElementById('prod-name') as HTMLInputElement | null;
const prodIdInput = document.getElementById('prod-id') as HTMLInputElement | null;
if (prodNameInput && prodIdInput) {
    prodNameInput.addEventListener('input', () => {
        const method = ($input('prod-method')?.value || 'POST');
        if (method === 'POST' && !prodIdInput.dataset.manual) {
            prodIdInput.value = prodNameInput.value
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '');
        }
    });
    prodIdInput.addEventListener('input', () => {
        prodIdInput.dataset.manual = 'true';
    });
}

// Live preview de imagen de producto
const prodImageInput = document.getElementById('prod-image');
if (prodImageInput) {
    prodImageInput.addEventListener('input', (e) => {
        const val = (e.target as HTMLInputElement).value.trim();
        const preview = document.getElementById('prod-image-preview');
        if (preview) {
            if (val) {
                preview.innerHTML = `<img src="${escapeHtml(val)}" alt="Vista previa" class="prod-thumb-img" />`;
                preview.classList.remove('d-none');
            } else {
                preview.innerHTML = '';
                preview.classList.add('d-none');
            }
        }
    });
}

// --- BOTONES DE ACTUALIZACIÓN EN VIVO ---
const btnRefreshOrders = document.getElementById('btn-refresh-orders');
if (btnRefreshOrders) {
    btnRefreshOrders.addEventListener('click', () => {
        btnRefreshOrders.classList.add('spin');
        loadOrders().then(() => {
            showToast('Lista de pedidos sincronizada.', 'success');
            btnRefreshOrders.classList.remove('spin');
        });
    });
}

const btnRefreshProducts = document.getElementById('btn-refresh-products');
if (btnRefreshProducts) {
    btnRefreshProducts.addEventListener('click', () => {
        btnRefreshProducts.classList.add('spin');
        loadProducts().then(() => {
            showToast('Menú sincronizado.', 'success');
            btnRefreshProducts.classList.remove('spin');
        });
    });
}

const btnRefreshSales = document.getElementById('btn-refresh-sales');
if (btnRefreshSales) {
    btnRefreshSales.addEventListener('click', () => {
        btnRefreshSales.classList.add('spin');
        loadSales().then(() => {
            showToast('Registro de ventas sincronizado.', 'success');
            btnRefreshSales.classList.remove('spin');
        });
    });
}

window.addEventListener('DOMContentLoaded', () => {
    checkSession();
    
    // Sidebar colapsable en móvil
    const sidebar = document.querySelector('.sidebar');
    const btnSidebarToggle = document.getElementById('btn-sidebar-toggle');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    
    if (btnSidebarToggle && sidebar && sidebarOverlay) {
        btnSidebarToggle.addEventListener('click', () => {
            sidebar.classList.toggle('active');
            sidebarOverlay.classList.toggle('active');
        });
        
        sidebarOverlay.addEventListener('click', () => {
            sidebar.classList.remove('active');
            sidebarOverlay.classList.remove('active');
        });
        
        const sidebarMenuLinks = document.querySelectorAll('.sidebar-link');
        sidebarMenuLinks.forEach(link => {
            link.addEventListener('click', () => {
                if (window.innerWidth <= 992) {
                    sidebar.classList.remove('active');
                    sidebarOverlay.classList.remove('active');
                }
            });
        });
    }
});

// Exponer funciones globales para controladores onclick en HTML
window.updateOrderStatus = updateOrderStatus;
window.deleteOrder = deleteOrder;
window.viewOrderDetails = viewOrderDetails;
window.startEditProduct = startEditProduct;
window.deleteProduct = deleteProduct;
window.duplicateProduct = duplicateProduct;
window.openQuickEditModal = openQuickEditModal;
window.closeQuickEditModal = closeQuickEditModal;
window.checkSession = checkSession;

// --- GESTIÓN DE TASA BCV ---
const bcvModal = document.getElementById('bcv-modal');
const btnOpenBcvModal = document.getElementById('btn-open-bcv-modal');
const btnCloseBcvModal = document.getElementById('btn-close-bcv-modal');
const btnCancelBcv = document.getElementById('btn-cancel-bcv');
const bcvForm = document.getElementById('bcv-form');

function openBcvModal() {
    if (bcvModal) bcvModal.classList.add('active');
    const input = $input('bcv-rate-input');
    if (input) input.value = currentBcvRate.toFixed(2);
    const toggle = $input('bcv-auto-toggle');
    if (toggle) toggle.checked = currentBcvAuto;
}
function closeBcvModal() {
    if (bcvModal) bcvModal.classList.remove('active');
}

if (btnOpenBcvModal) btnOpenBcvModal.addEventListener('click', openBcvModal);
if (btnCloseBcvModal) btnCloseBcvModal.addEventListener('click', closeBcvModal);
if (btnCancelBcv) btnCancelBcv.addEventListener('click', closeBcvModal);
if (bcvModal) {
    bcvModal.addEventListener('click', (e) => {
        if (e.target === bcvModal) closeBcvModal();
    });
}

if (bcvForm) {
    bcvForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const rateInput = $input('bcv-rate-input');
        const autoToggle = $input('bcv-auto-toggle');
        const newRate = parseFloat(rateInput?.value || '0');
        const autoUpdate = autoToggle ? autoToggle.checked : true;

        if (!newRate || newRate <= 0) {
            showToast('Por favor introduce una tasa válida.', 'warning');
            return;
        }

        try {
            const res = await fetch('/api/bcv', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rate: newRate, autoUpdate })
            });
            const data = (await res.json()) as any;
            if (res.ok && data.success) {
                showToast('✅ Tasa BCV actualizada correctamente.', 'success');
                currentBcvRate = newRate;
                currentBcvAuto = autoUpdate;
                const display = document.getElementById('admin-bcv-val');
                if (display) display.textContent = `${newRate.toFixed(2)} Bs.`;
                closeBcvModal();
            } else {
                showToast(data.error || 'Error al actualizar tasa BCV.', 'error');
            }
        } catch (err) {
            showToast('Error de conexión al guardar tasa.', 'error');
        }
    });
}

// --- GESTIÓN DE VISOR DE COMPROBANTES ---
const receiptModal = document.getElementById('receipt-modal');
const btnViewReceiptModal = document.getElementById('btn-view-receipt-modal');
const modalReceiptThumb = document.getElementById('modal-receipt-thumb');
const btnCloseReceiptModal = document.getElementById('btn-close-receipt-modal');
const btnCloseReceiptFooter = document.getElementById('btn-close-receipt-footer');

function openReceiptModal() {
    if (receiptModal) receiptModal.classList.add('active');
}
function closeReceiptModal() {
    if (receiptModal) receiptModal.classList.remove('active');
}

if (btnViewReceiptModal) btnViewReceiptModal.addEventListener('click', openReceiptModal);
if (modalReceiptThumb) modalReceiptThumb.addEventListener('click', openReceiptModal);
if (btnCloseReceiptModal) btnCloseReceiptModal.addEventListener('click', closeReceiptModal);
if (btnCloseReceiptFooter) btnCloseReceiptFooter.addEventListener('click', closeReceiptModal);
if (receiptModal) {
    receiptModal.addEventListener('click', (e) => {
        if (e.target === receiptModal) closeReceiptModal();
    });
}

// --- SINCRONIZACIÓN EN VIVO DESDE MODAL BCV ---
const btnForceBcvSync = $btn('btn-force-bcv-sync');
if (btnForceBcvSync) {
    btnForceBcvSync.addEventListener('click', async () => {
        btnForceBcvSync.disabled = true;
        const originalHTML = btnForceBcvSync.innerHTML;
        btnForceBcvSync.innerHTML = '<i data-lucide="loader" class="spin"></i> Sincronizando...';
        if (window.lucide) lucide.createIcons();

        try {
            const res = await fetch('/api/bcv?force=true');
            const data = (await res.json()) as any;
            if (res.ok && data.rate) {
                currentBcvRate = parseFloat(data.rate);
                currentBcvAuto = data.autoUpdate !== false;
                lastBcvUpdated = data.lastUpdated || '';
                lastBcvSource = data.source || 'bcv_api';

                const bcvRateIn = $input('bcv-rate-input');
                if (bcvRateIn) bcvRateIn.value = currentBcvRate.toFixed(2);
                const display = document.getElementById('admin-bcv-val');
                if (display) display.textContent = `${currentBcvRate.toFixed(2)} Bs.`;
                const syncLabel = document.getElementById('bcv-last-sync-label') || document.getElementById('bcv-last-sync-text');
                if (syncLabel) {
                    const dateStr = lastBcvUpdated ? new Date(lastBcvUpdated).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }) : 'reciente';
                    syncLabel.textContent = `Última sincronización: ${dateStr} (Oficial BCV)`;
                }
                showToast(`✅ Tasa oficial actualizada: ${currentBcvRate.toFixed(2)} Bs.`, 'success');
            } else {
                showToast('No se pudo obtener la tasa oficial en vivo.', 'warning');
            }
        } catch (err) {
            console.error(err);
            showToast('Error de conexión al sincronizar con BCV.', 'error');
        } finally {
            btnForceBcvSync.disabled = false;
            btnForceBcvSync.innerHTML = originalHTML;
            if (window.lucide) lucide.createIcons();
        }
    });
}

// --- SISTEMA DE AUDIO Y ALERTAS PARA NUEVOS PEDIDOS ---
function playOrderChime() {
    if (!soundEnabled) return;
    try {
        const AudioContextClass = window.AudioContext || window['webkitAudioContext'];
        if (!AudioContextClass) return;
        const ctx = new AudioContextClass();
        const now = ctx.currentTime;

        // Tono 1: Nota D5 (587.33 Hz)
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'triangle';
        osc1.frequency.setValueAtTime(587.33, now);
        gain1.gain.setValueAtTime(0.18, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start(now);
        osc1.stop(now + 0.35);

        // Tono 2: Nota A5 (880 Hz) con micro-retardo
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(880, now + 0.12);
        gain2.gain.setValueAtTime(0.22, now + 0.12);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(now + 0.12);
        osc2.stop(now + 0.65);
    } catch (e) {
        console.warn('Alerta de audio no reproducible en este contexto:', e);
    }
}

let originalPageTitle = document.title;
let titleFlashTimer: any = null;

function flashPageTitle() {
    if (titleFlashTimer || document.hasFocus()) return;
    let isAlert = false;
    titleFlashTimer = setInterval(() => {
        document.title = isAlert ? '🔔 (1) ¡Nuevo Pedido!' : originalPageTitle;
        isAlert = !isAlert;
    }, 1000);

    const stopFlashing = () => {
        if (titleFlashTimer) {
            clearInterval(titleFlashTimer);
            titleFlashTimer = null;
            document.title = originalPageTitle;
        }
        window.removeEventListener('focus', stopFlashing);
    };
    window.addEventListener('focus', stopFlashing);
}

// Botón de alternar audio
const btnToggleSound = document.getElementById('btn-toggle-sound');
function updateSoundIcon() {
    const icon = document.getElementById('sound-icon');
    if (!icon) return;
    if (soundEnabled) {
        icon.setAttribute('data-lucide', 'volume-2');
        if (btnToggleSound) btnToggleSound.title = 'Alertas de sonido activadas (clic para silenciar)';
    } else {
        icon.setAttribute('data-lucide', 'volume-x');
        if (btnToggleSound) btnToggleSound.title = 'Alertas de sonido silenciadas (clic para activar)';
    }
    if (window.lucide) lucide.createIcons();
}

if (btnToggleSound) {
    updateSoundIcon();
    btnToggleSound.addEventListener('click', () => {
        soundEnabled = !soundEnabled;
        localStorage.setItem('admin_sound_enabled', String(soundEnabled));
        updateSoundIcon();
        if (soundEnabled) {
            playOrderChime();
            showToast('Sonido de pedidos activado.', 'info');
        } else {
            showToast('Sonido de pedidos silenciado.', 'info');
        }
    });
}

// --- SISTEMA DE NOTIFICACIONES WEB PUSH ---
function setupWebPushNotifications() {
    const btnHeaderPush = document.getElementById('btn-toggle-push');
    const btnOrdersPush = document.getElementById('btn-toggle-orders-push');
    const headerPushDot = document.getElementById('push-status-dot');
    const ordersPushDot = document.getElementById('orders-push-dot');

    if (!('Notification' in window)) {
        if (btnHeaderPush) btnHeaderPush.classList.add('d-none');
        if (btnOrdersPush) btnOrdersPush.classList.add('d-none');
        return;
    }

    const updatePushUI = () => {
        const isGranted = Notification.permission === 'granted';
        if (isGranted) {
            btnHeaderPush?.classList.add('active');
            btnOrdersPush?.classList.add('active');
            headerPushDot?.classList.remove('d-none');
            ordersPushDot?.classList.remove('d-none');
            if (btnHeaderPush) btnHeaderPush.title = 'Notificaciones Web Push activas (clic para enviar prueba)';
            if (btnOrdersPush) btnOrdersPush.title = 'Notificaciones Web Push activas (clic para enviar prueba)';
        } else {
            btnHeaderPush?.classList.remove('active');
            btnOrdersPush?.classList.remove('active');
            headerPushDot?.classList.add('d-none');
            ordersPushDot?.classList.add('d-none');
            if (btnHeaderPush) btnHeaderPush.title = 'Activar notificaciones de escritorio / Web Push';
            if (btnOrdersPush) btnOrdersPush.title = 'Activar notificaciones de escritorio / Web Push';
        }
    };

    updatePushUI();

    const handlePushToggle = async () => {
        if (Notification.permission === 'granted') {
            showToast('Las notificaciones Web Push ya están activadas.', 'info');
            sendWebPushNotification('🔔 Ventrina Notificaciones', 'Sistema de alertas de pedidos activo y funcionando.');
            return;
        }

        if (Notification.permission === 'denied') {
            showToast('Las notificaciones están bloqueadas en tu navegador. Por favor habilítalas en el candado de la barra de direcciones.', 'warning');
            return;
        }

        try {
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
                updatePushUI();
                showToast('¡Notificaciones Web Push activadas con éxito! Recibirás alertas inmediatas al llegar nuevos pedidos.', 'success');
                sendWebPushNotification('🎉 ¡Notificaciones activadas!', 'A partir de ahora recibirás alertas instantáneas cuando entre un nuevo pedido.');
            } else {
                showToast('No se otorgaron permisos para notificaciones.', 'info');
            }
        } catch (e) {
            console.error('Error solicitando permisos de notificación:', e);
        }
    };

    if (btnHeaderPush) btnHeaderPush.addEventListener('click', handlePushToggle);
    if (btnOrdersPush) btnOrdersPush.addEventListener('click', handlePushToggle);
}

function sendWebPushNotification(title: string, body: string, orderId?: string) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    try {
        const notif = new Notification(title, {
            body,
            icon: '/assets/favicon.svg',
            badge: '/assets/favicon.svg',
            tag: orderId ? `order-${orderId}` : `ventrina-${Date.now()}`
        });

        notif.onclick = () => {
            window.focus();
            if (orderId) {
                const navOrders = document.querySelector('.sidebar-link[data-target="section-orders"], .sidebar-link[data-target="orders"]') as HTMLElement | null;
                if (navOrders) navOrders.click();
                viewOrderDetails(orderId);
            }
        };
    } catch (e) {
        console.warn('Error al enviar notificación:', e);
    }
}
setupWebPushNotifications();

// --- BÚSQUEDA Y FILTRADO REACTIVO EN TABLAS ---
function debounce(func: (...args: any[]) => any, wait: number) {
    let timeout: any;
    return function executedFunction(...args: any[]) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Buscador de Pedidos
const ordersSearchInput = document.getElementById('orders-search-input');
if (ordersSearchInput) {
    ordersSearchInput.addEventListener('input', debounce((e) => {
        ordersSearchQuery = e.target.value.trim();
        renderOrders();
    }, 300));
}

// Filtro de Estado de Pedidos
const ordersStatusFilterEl = document.getElementById('orders-status-filter');
if (ordersStatusFilterEl) {
    ordersStatusFilterEl.addEventListener('change', (e) => {
        ordersStatusFilter = (e.target as HTMLSelectElement).value;
        renderOrders();
    });
}

// Filtro de Fecha de Pedidos
const ordersDateFilterEl = document.getElementById('orders-date-filter');
if (ordersDateFilterEl) {
    ordersDateFilterEl.addEventListener('change', (e) => {
        ordersDateFilter = (e.target as HTMLSelectElement).value;
        renderOrders();
    });
}

// Buscador de Ventas
const salesSearchInput = document.getElementById('sales-search-input');
if (salesSearchInput) {
    salesSearchInput.addEventListener('input', debounce((e) => {
        salesSearchQuery = (e.target as HTMLInputElement).value.trim();
        renderSales();
    }, 300));
}

const btnFilterSalesDates = document.getElementById('btn-filter-sales-dates');
if (btnFilterSalesDates) {
    btnFilterSalesDates.addEventListener('click', () => {
        const dateFrom = $val('sales-date-from');
        const dateTo = $val('sales-date-to');
        loadSales(dateFrom, dateTo);
    });
}

// Buscador de Productos
const productsSearchInput = document.getElementById('products-search-input');
if (productsSearchInput) {
    productsSearchInput.addEventListener('input', debounce((e) => {
        productsSearchQuery = (e.target as HTMLInputElement).value.trim();
        renderProductsTable();
    }, 300));
}

// --- EXPORTACIÓN DE REPORTES A CSV (EXCEL FRIENDLY) ---

// --- PAGINATION UI & EVENTS ---
function updatePaginationUI(type: string, currentPage: number, totalPages: number) {
    const btnPrev = document.getElementById(`btn-${type}-prev`);
    const btnNext = document.getElementById(`btn-${type}-next`);
    const pageInfo = document.getElementById(`${type}-page-info`);
    
    if (btnPrev && btnNext && pageInfo) {
        pageInfo.textContent = `Página ${currentPage} de ${totalPages}`;
        (btnPrev as HTMLButtonElement).disabled = currentPage <= 1;
        (btnNext as HTMLButtonElement).disabled = currentPage >= totalPages;
    }
}

// --- FACTURACIÓN: MEJORAR PLAN Y REPORTAR PAGO ---
function handleUpgradePlan() {
    const domain = document.getElementById('billing-tenant-domain')?.textContent || 'mi tienda';
    const msg = `¡Hola Ventrina Soporte! Deseo mejorar mi plan para la tienda (${domain}). ¿Cuáles son los planes y opciones disponibles?`;
    const supportPhone = document.getElementById('pay-phone')?.textContent?.replace(/[^\d]/g, '') || '584141234567';
    let cleanPhone = supportPhone.startsWith('0') ? '58' + supportPhone.slice(1) : supportPhone;
    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`, '_blank');
}

function handleReportPayment() {
    const domain = document.getElementById('billing-tenant-domain')?.textContent || 'mi tienda';
    const amount = document.getElementById('pay-amount')?.textContent || '15';
    const msg = `¡Hola Ventrina Soporte! Adjunto mi comprobante de pago de suscripción ($${amount} USD) para la tienda (${domain}).`;
    const supportPhone = document.getElementById('pay-phone')?.textContent?.replace(/[^\d]/g, '') || '584141234567';
    let cleanPhone = supportPhone.startsWith('0') ? '58' + supportPhone.slice(1) : supportPhone;
    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`, '_blank');
}

document.addEventListener('click', (e) => {
    const t = e.target as HTMLElement | null;
    if (!t) return;

    // Navegar a Facturación desde tarjetas de analíticas bloqueadas (Plan Básico / Gratis)
    if (t.closest('.go-to-billing-btn')) {
        const billingTab = document.querySelector('.sidebar-link[data-target="section-billing"]') as HTMLElement | null;
        if (billingTab) {
            billingTab.click();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
        return;
    }

    // View Order Details
    const btnViewOrder = t.closest('[data-action="view-order"]') as HTMLElement | null;
    if (btnViewOrder) {
        const orderId = btnViewOrder.getAttribute('data-id');
        if (orderId) viewOrderDetails(orderId);
        return;
    }

    // Delete Order
    const btnDeleteOrder = t.closest('[data-action="delete-order"]') as HTMLElement | null;
    if (btnDeleteOrder) {
        const orderId = btnDeleteOrder.getAttribute('data-id');
        if (orderId) deleteOrder(orderId);
        return;
    }

    // Copy Product Link
    const btnCopyProduct = t.closest('[data-action="copy-product-link"]') as HTMLElement | null;
    if (btnCopyProduct) {
        const prodId = btnCopyProduct.getAttribute('data-id') || '';
        const prodName = btnCopyProduct.getAttribute('data-name') || prodId;
        const productUrl = `${window.location.origin}/producto?id=${encodeURIComponent(prodId)}`;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(productUrl).then(() => {
                showToast(`¡Enlace de "${prodName}" copiado! Listo para compartir en WhatsApp.`, 'success');
            }).catch(() => {
                prompt('Copia este enlace para compartir:', productUrl);
            });
        } else {
            prompt('Copia este enlace para compartir:', productUrl);
        }
        return;
    }

    // Edit Product
    const btnEditProduct = t.closest('[data-action="edit-product"]') as HTMLElement | null;
    if (btnEditProduct) {
        const prodId = btnEditProduct.getAttribute('data-id');
        if (prodId) startEditProduct(prodId);
        return;
    }

    // Duplicate Product
    const btnDuplicateProduct = t.closest('[data-action="duplicate-product"]') as HTMLElement | null;
    if (btnDuplicateProduct) {
        const prodId = btnDuplicateProduct.getAttribute('data-id');
        if (prodId) duplicateProduct(prodId);
        return;
    }

    // Quick Edit Product
    const btnQuickEditProduct = t.closest('[data-action="quick-edit-product"]') as HTMLElement | null;
    if (btnQuickEditProduct) {
        const prodId = btnQuickEditProduct.getAttribute('data-id');
        if (prodId) openQuickEditModal(prodId);
        return;
    }

    // Close Quick Edit Modal
    if (t.closest('#btn-close-quick-edit-modal') || t.closest('#btn-cancel-quick-edit')) {
        closeQuickEditModal();
        return;
    }

    // Gestor de Categorías: Abrir / Cerrar / Acciones
    if (t.closest('#btn-open-categories-modal')) {
        openCategoriesModal();
        return;
    }
    if (t.closest('#btn-close-categories-modal') || t.closest('#btn-close-categories-footer')) {
        closeCategoriesModal();
        return;
    }
    if (t.closest('#btn-refresh-categories')) {
        loadCategories();
        return;
    }
    const btnRenameCat = t.closest('.btn-trigger-rename-cat') as HTMLElement | null;
    if (btnRenameCat) {
        const slug = btnRenameCat.getAttribute('data-slug') || '';
        const name = btnRenameCat.getAttribute('data-name') || '';
        const icon = btnRenameCat.getAttribute('data-icon') || 'tag';
        openRenameCategoryModal(slug, name, icon);
        return;
    }
    if (t.closest('#btn-close-cat-rename-modal') || t.closest('#btn-cancel-cat-rename')) {
        closeRenameCategoryModal();
        return;
    }
    const btnDeleteCat = t.closest('.btn-trigger-delete-cat') as HTMLElement | null;
    if (btnDeleteCat) {
        const slug = btnDeleteCat.getAttribute('data-slug') || '';
        const name = btnDeleteCat.getAttribute('data-name') || '';
        const count = parseInt(btnDeleteCat.getAttribute('data-count') || '0', 10);
        openDeleteCategoryModal(slug, name, count);
        return;
    }
    if (t.closest('#btn-close-cat-delete-modal') || t.closest('#btn-cancel-cat-delete')) {
        closeDeleteCategoryModal();
        return;
    }

    // Bulk Actions Toolbar Buttons
    if (t.closest('#btn-bulk-active-on')) {
        handleBulkActivate(1);
        return;
    }
    if (t.closest('#btn-bulk-active-off')) {
        handleBulkActivate(0);
        return;
    }
    if (t.closest('#btn-bulk-price')) {
        handleBulkPriceAdjust();
        return;
    }
    if (t.closest('#btn-bulk-delete')) {
        handleBulkDelete();
        return;
    }
    if (t.closest('#btn-bulk-clear')) {
        clearBulkSelection();
        return;
    }

    // Delete Product
    const btnDeleteProduct = t.closest('[data-action="delete-product"]') as HTMLElement | null;
    if (btnDeleteProduct) {
        const prodId = btnDeleteProduct.getAttribute('data-id');
        if (prodId) deleteProduct(prodId);
        return;
    }

    // Toggle Coupon Status
    const btnToggleCoupon = t.closest('[data-action="toggle-coupon"]') as HTMLElement | null;
    if (btnToggleCoupon) {
        const couponId = parseInt(btnToggleCoupon.getAttribute('data-id') || '0', 10);
        const active = parseInt(btnToggleCoupon.getAttribute('data-active') || '0', 10);
        if (couponId) toggleCouponStatus(couponId, active);
        return;
    }

    // Delete Coupon
    const btnDeleteCoupon = t.closest('[data-action="delete-coupon"]') as HTMLElement | null;
    if (btnDeleteCoupon) {
        const couponId = parseInt(btnDeleteCoupon.getAttribute('data-id') || '0', 10);
        if (couponId) deleteCoupon(couponId);
        return;
    }

    // Print Order Ticket
    if (t.closest('#btn-print-order-ticket')) {
        window.print();
        return;
    }

    // Billing Upgrade Plan
    if (t.closest('#btn-upgrade-plan')) {
        handleUpgradePlan();
        return;
    }

    // Billing Report Payment
    if (t.closest('#btn-report-payment')) {
        handleReportPayment();
        return;
    }

    // Upload Product Image Trigger
    if (t.closest('#btn-upload-prod-image')) {
        const fileInput = document.getElementById('prod-image-file') as HTMLInputElement | null;
        if (fileInput) fileInput.click();
        return;
    }

    // Orders Pagination
    if (t.closest('#btn-orders-prev') && ordersPage > 1) loadOrders(ordersPage - 1);
    if (t.closest('#btn-orders-next') && ordersPage < ordersTotalPages) loadOrders(ordersPage + 1);
    
    // Products Pagination
    if (t.closest('#btn-products-prev') && productsPage > 1) loadProducts(productsPage - 1);
    if (t.closest('#btn-products-next') && productsPage < productsTotalPages) loadProducts(productsPage + 1);
    
    // Sales Pagination
    if (t.closest('#btn-sales-prev') && salesPage > 1) {
        const dFrom = $val('sales-date-from');
        const dTo = $val('sales-date-to');
        loadSales(dFrom, dTo, salesPage - 1);
    }
    if (t.closest('#btn-sales-next') && salesPage < salesTotalPages) {
        const dFrom = $val('sales-date-from');
        const dTo = $val('sales-date-to');
        loadSales(dFrom, dTo, salesPage + 1);
    }
});

// Delegación centralizada de eventos change
document.addEventListener('change', (e) => {
    const t = e.target as HTMLElement | null;
    if (!t) return;

    // Cambio de estado de pedido en tabla
    if (t.matches('select[data-action="status-select"]')) {
        const select = t as unknown as HTMLSelectElement;
        const orderId = select.getAttribute('data-id');
        const newStatus = select.value;
        if (orderId && newStatus) {
            updateOrderStatus(orderId, newStatus);
        }
        return;
    }

    // Selección de archivo para imagen de producto
    if (t.id === 'prod-image-file') {
        const fileInput = t as HTMLInputElement;
        const file = fileInput.files?.[0];
        const preview = document.getElementById('prod-image-preview');
        const urlInput = document.getElementById('prod-image') as HTMLInputElement | null;
        if (file) {
            const objectUrl = URL.createObjectURL(file);
            if (preview) {
                preview.style.backgroundImage = `url('${objectUrl}')`;
                preview.classList.remove('d-none');
            }
            if (urlInput) urlInput.placeholder = `Archivo: ${file.name} (se subirá al guardar)`;
            showToast(`Imagen "${file.name}" lista para guardar.`, 'info');
        }
    }
});

function downloadCSV(filename: string, csvContent: string) {
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function exportOrdersToCSV() {
    if (!ordersList || ordersList.length === 0) {
        showToast('No hay pedidos registrados para exportar.', 'warning');
        return;
    }
    const headers = ['ID Pedido', 'Cliente', 'Telefono', 'Tipo Entrega', 'Direccion', 'Notas', 'Metodo Pago', 'Referencia', 'Articulos', 'Total USD', 'Tasa BCV', 'Total Bs', 'Estado', 'Fecha'];
    const rows = ordersList.map(o => [
        `"${o.id || ''}"`,
        `"${(o.client_name || '').replace(/"/g, '""')}"`,
        `"${(o.client_phone || '').replace(/"/g, '""')}"`,
        `"${o.delivery_type || ''}"`,
        `"${(o.delivery_address || '').replace(/"/g, '""')}"`,
        `"${(o.delivery_notes || '').replace(/"/g, '""')}"`,
        `"${(o.payment_method || '').replace(/"/g, '""')}"`,
        `"${(o.payment_reference || '').replace(/"/g, '""')}"`,
        o.total_items || 0,
        (parseFloat(o.total_price) || 0).toFixed(2),
        (parseFloat(o.bcv_rate) || 0).toFixed(2),
        (parseFloat(o.total_bs) || 0).toFixed(2),
        `"${o.status || ''}"`,
        `"${o.created_at || ''}"`
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const dateStr = new Date().toISOString().split('T')[0];
    downloadCSV(`pedidos_ventrina_${dateStr}.csv`, csv);
    showToast('Archivo CSV de pedidos generado.', 'success');
}

function exportSalesToCSV() {
    if (!salesList || salesList.length === 0) {
        showToast('No hay ventas registradas para exportar.', 'warning');
        return;
    }
    const headers = ['ID Venta', 'ID Pedido', 'Cliente', 'Telefono', 'Monto USD', 'Metodo Pago', 'Fecha'];
    const rows = salesList.map(s => [
        `"V-${s.id || ''}"`,
        `"${s.order_id || ''}"`,
        `"${(s.client_name || '').replace(/"/g, '""')}"`,
        `"${(s.client_phone || '').replace(/"/g, '""')}"`,
        (parseFloat(s.monto) || 0).toFixed(2),
        `"${(s.metodo_pago || '').replace(/"/g, '""')}"`,
        `"${s.fecha || ''}"`
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const dateStr = new Date().toISOString().split('T')[0];
    downloadCSV(`ventas_ventrina_${dateStr}.csv`, csv);
    showToast('Archivo CSV de ventas generado.', 'success');
}

const btnExportOrders = document.getElementById('btn-export-orders');
if (btnExportOrders) {
    btnExportOrders.addEventListener('click', exportOrdersToCSV);
}

const btnExportSales = document.getElementById('btn-export-sales');
if (btnExportSales) {
    btnExportSales.addEventListener('click', exportSalesToCSV);
}

function exportProductsToCSV() {
    if (!productsList || productsList.length === 0) {
        showToast('No hay productos en el catálogo para exportar.', 'warning');
        return;
    }
    const headers = ['ID', 'Nombre', 'Plantilla', 'Categoria', 'Precio USD', 'Stock', 'Opciones', 'Descripcion', 'Disponible', 'Imagen'];
    const rows = productsList.map(p => [
        `"${(p.id || '').replace(/"/g, '""')}"`,
        `"${(p.name || '').replace(/"/g, '""')}"`,
        `"${(p.template || 'restaurant').replace(/"/g, '""')}"`,
        `"${(p.category || p.type_id || 'principales').replace(/"/g, '""')}"`,
        (parseFloat(p.price) || 0).toFixed(2),
        p.stock !== undefined && p.stock !== null ? p.stock : -1,
        `"${(p.sizes || '').replace(/"/g, '""')}"`,
        `"${(p.description || '').replace(/"/g, '""')}"`,
        p.active === 0 ? 0 : 1,
        `"${(p.image_url || '').replace(/"/g, '""')}"`
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const dateStr = new Date().toISOString().split('T')[0];
    downloadCSV(`productos_catalogo_${dateStr}.csv`, csv);
    showToast(`Catálogo exportado exitosamente (${productsList.length} productos).`, 'success');
}

const btnExportProducts = document.getElementById('btn-export-products');
if (btnExportProducts) {
    btnExportProducts.addEventListener('click', exportProductsToCSV);
}

function setupProductsCSVImport() {
    const btnImport = document.getElementById('btn-import-products');
    const fileInput = document.getElementById('products-csv-file') as HTMLInputElement | null;
    if (!btnImport || !fileInput) return;

    btnImport.addEventListener('click', () => {
        fileInput.value = '';
        fileInput.click();
    });

    fileInput.addEventListener('change', async () => {
        const file = fileInput.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const text = e.target?.result as string;
                if (!text) {
                    showToast('El archivo CSV está vacío.', 'error');
                    return;
                }

                const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
                if (lines.length <= 1) {
                    showToast('El archivo CSV no contiene filas de datos.', 'warning');
                    return;
                }

                const firstLine = lines[0];
                const delimiter = firstLine.includes(';') ? ';' : ',';

                const parseCsvLine = (line: string): string[] => {
                    const result: string[] = [];
                    let cur = '';
                    let inQuotes = false;
                    for (let i = 0; i < line.length; i++) {
                        const char = line[i];
                        if (char === '"') {
                            if (inQuotes && line[i + 1] === '"') {
                                cur += '"';
                                i++;
                            } else {
                                inQuotes = !inQuotes;
                            }
                        } else if (char === delimiter && !inQuotes) {
                            result.push(cur.trim());
                            cur = '';
                        } else {
                            cur += char;
                        }
                    }
                    result.push(cur.trim());
                    return result;
                };

                const rawHeaders = parseCsvLine(lines[0]).map(h => 
                    h.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, '')
                );
                
                const idIdx = rawHeaders.findIndex(h => h === 'id' || h === 'slug' || h === 'codigo');
                const nameIdx = rawHeaders.findIndex(h => h === 'nombre' || h === 'name' || h === 'producto');
                const priceIdx = rawHeaders.findIndex(h => h === 'precio' || h === 'preciousd' || h === 'price');
                const templateIdx = rawHeaders.findIndex(h => h === 'plantilla' || h === 'template');
                const categoryIdx = rawHeaders.findIndex(h => h === 'categoria' || h === 'category' || h === 'rubro');
                const stockIdx = rawHeaders.findIndex(h => h === 'stock' || h === 'inventario' || h === 'cantidad');
                const sizesIdx = rawHeaders.findIndex(h => h === 'opciones' || h === 'sizes' || h === 'tallas' || h === 'variantes');
                const descIdx = rawHeaders.findIndex(h => h === 'descripcion' || h === 'description' || h === 'detalle');
                const activeIdx = rawHeaders.findIndex(h => h === 'disponible' || h === 'activo' || h === 'active');
                const imageIdx = rawHeaders.findIndex(h => h === 'imagen' || h === 'image' || h === 'imageurl');

                if (nameIdx === -1 || priceIdx === -1) {
                    showToast('El CSV debe incluir al menos las columnas "Nombre" y "Precio".', 'error');
                    return;
                }

                const dataRows = lines.slice(1);
                const confirmed = confirm(`Se encontraron ${dataRows.length} productos en el archivo CSV. ¿Deseas importarlos/actualizarlos en tu catálogo?`);
                if (!confirmed) return;

                showToast(`Iniciando importación masiva de ${dataRows.length} productos...`, 'info');

                let processedCount = 0;
                let errorCount = 0;

                for (const rowStr of dataRows) {
                    const cols = parseCsvLine(rowStr);
                    if (!cols || cols.length === 0 || cols.every(c => c === '')) continue;

                    const rawName = cols[nameIdx] || '';
                    if (!rawName) continue;

                    let rawPrice = cols[priceIdx] ? parseFloat(cols[priceIdx].replace(',', '.')) : 0;
                    if (isNaN(rawPrice)) rawPrice = 0;

                    let rawId = idIdx !== -1 && cols[idIdx] ? cols[idIdx] : '';
                    if (!rawId) {
                        rawId = rawName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
                    }

                    const rawTemplate = templateIdx !== -1 && cols[templateIdx] ? cols[templateIdx].toLowerCase() : 'restaurant';
                    const rawCategory = categoryIdx !== -1 && cols[categoryIdx] ? cols[categoryIdx] : 'principales';
                    const rawStock = stockIdx !== -1 && cols[stockIdx] ? parseInt(cols[stockIdx], 10) : -1;
                    const rawSizes = sizesIdx !== -1 && cols[sizesIdx] ? cols[sizesIdx] : null;
                    const rawDesc = descIdx !== -1 && cols[descIdx] ? cols[descIdx] : '';
                    const rawActive = activeIdx !== -1 && cols[activeIdx] ? (cols[activeIdx] === '0' || cols[activeIdx].toLowerCase() === 'no' || cols[activeIdx].toLowerCase() === 'falso' ? 0 : 1) : 1;
                    const rawImage = imageIdx !== -1 && cols[imageIdx] ? cols[imageIdx] : '/assets/favicon.svg';

                    const exists = productsList.some(p => p.id === rawId);
                    const method = exists ? 'PUT' : 'POST';

                    const payload = {
                        id: rawId,
                        name: rawName,
                        price: rawPrice,
                        template: rawTemplate,
                        category: rawCategory,
                        stock: isNaN(rawStock) ? -1 : rawStock,
                        sizes: rawSizes,
                        description: rawDesc,
                        active: rawActive,
                        image_url: rawImage,
                        icon: 'package'
                    };

                    try {
                        const res = await fetch('/api/products', {
                            method,
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(payload)
                        });
                        if (res.ok) {
                            processedCount++;
                        } else {
                            errorCount++;
                        }
                    } catch {
                        errorCount++;
                    }
                }

                showToast(`Importación completada: ${processedCount} procesados, ${errorCount} errores.`, processedCount > 0 ? 'success' : 'error');
                loadProducts();
            } catch (err) {
                console.error('Error importando CSV:', err);
                showToast('Error procesando el archivo CSV.', 'error');
            }
        };
        reader.readAsText(file, 'UTF-8');
    });
}
setupProductsCSVImport();

// --- POLLING AUTOMÁTICO EN TIEMPO REAL (CADA 15s) ---
setInterval(() => {
    if (currentAdmin && document.visibilityState === 'visible' && navigator.onLine) {
        loadOrders();
    }
}, 15000);

// --- ESTADO DE CONEXIÓN (OFFLINE/ONLINE) ---
const connectionStatus = document.getElementById('connection-status');
const connectionStatusText = document.getElementById('connection-status-text');

function updateConnectionStatus() {
    if (!connectionStatus || !connectionStatusText) return;
    
    if (navigator.onLine) {
        connectionStatus.classList.remove('offline');
        connectionStatus.classList.add('online');
        connectionStatusText.textContent = 'En línea';
        // Refrescar al reconectar
        if (currentAdmin) refreshAllData();
    } else {
        connectionStatus.classList.remove('online');
        connectionStatus.classList.add('offline');
        connectionStatusText.textContent = 'Sin Conexión';
    }
}

window.addEventListener('online', updateConnectionStatus);
window.addEventListener('offline', updateConnectionStatus);
updateConnectionStatus();

// --- GESTIÓN DE CONFIGURACIÓN INTEGRAL DE TIENDA (CRUD DE AJUSTES) ---

// Helper para subir archivos de imagen con respaldo local
async function uploadImageFile(file: File): Promise<string | null> {
    if (!file) return null;
    if (file.size > 5 * 1024 * 1024) {
        showToast('La imagen supera los 5MB permitidos.', 'error');
        return null;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
        const res = await fetch('/api/upload?type=store', {
            method: 'POST',
            body: formData
        });
        const data = (await res.json()) as any;
        if (res.ok && data.url) {
            return data.url;
        }
    } catch (e) {
        console.warn('Endpoint /api/upload no disponible, utilizando respaldo local:', e);
    }

    // Respaldo en cliente con FileReader
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve((e.target?.result as string) || null);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
    });
}

function setPreviewImage(imgEl: any, placeholderEl: any, url?: string) {
    if (!imgEl) return;
    if (url && url.trim()) {
        imgEl.src = url;
        imgEl.classList.remove('file-input-hidden');
        if (placeholderEl) placeholderEl.classList.add('file-input-hidden');
    } else {
        imgEl.src = '';
        imgEl.classList.add('file-input-hidden');
        if (placeholderEl) placeholderEl.classList.remove('file-input-hidden');
    }
}

// Inicialización de pestañas en configuración
function initSettingsTabs() {
    const tabButtons = document.querySelectorAll('.settings-tab-btn');
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = (btn as HTMLElement).dataset.tab;
            if (!targetTab) return;

            tabButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const panels = document.querySelectorAll('.settings-tab-panel');
            panels.forEach(p => {
                if (p.id === targetTab) {
                    p.classList.add('active');
                } else {
                    p.classList.remove('active');
                }
            });

            if (window.lucide) lucide.createIcons();
        });
    });
}

// Configurar inputs de imagen simples (Logo y OG)
function setupSingleImageUploader(btnId: string, fileInputId: string, textInputId: string, previewImgId: string, placeholderId: string) {
    const btn = $btn(btnId);
    const fileInput = $input(fileInputId);
    const textInput = $input(textInputId);
    const previewImg = document.getElementById(previewImgId) as HTMLImageElement | null;
    const placeholder = document.getElementById(placeholderId);

    if (btn && fileInput) {
        btn.addEventListener('click', () => fileInput.click());
    }

    if (fileInput && textInput) {
        fileInput.addEventListener('change', async () => {
            if (fileInput.files && fileInput.files[0]) {
                const originalText = btn ? btn.innerHTML : '';
                if (btn) {
                    btn.disabled = true;
                    btn.innerHTML = '<i data-lucide="loader" class="spin"></i> Subiendo...';
                }
                if (window.lucide) lucide.createIcons();

                const url = await uploadImageFile(fileInput.files[0]);
                if (url) {
                    if (textInput) textInput.value = url;
                    setPreviewImage(previewImg, placeholder, url);
                    showToast('Imagen cargada con éxito.', 'success');
                }

                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = originalText;
                }
                if (window.lucide) lucide.createIcons();
            }
        });
    }

    if (textInput && previewImg) {
        textInput.addEventListener('input', () => {
            setPreviewImage(previewImg, placeholder, textInput.value.trim());
        });
    }
}

// --- RENDERIZADORES DE ELEMENTOS REPETITIVOS ---

// 1. Hero Slides
function renderHeroSlides(slides: any[] = []) {
    const container = document.getElementById('hero-slides-list');
    if (!container) return;
    container.innerHTML = '';

    slides.forEach((slide, idx) => {
        const row = document.createElement('div');
        row.className = 'dynamic-item-card hero-slide-row';
        row.innerHTML = `
            <div class="dynamic-item-header">
                <span class="dynamic-item-badge">
                    <i data-lucide="image"></i> Diapositiva #${idx + 1}
                </span>
                <button type="button" class="btn-remove-item btn-del-slide" title="Eliminar diapositiva">
                    <i data-lucide="trash-2"></i> Quitar
                </button>
            </div>
            <div class="settings-grid-2">
                <div class="settings-form-group">
                    <label>Imagen de la Portada</label>
                    <div class="image-upload-widget">
                        <div class="image-upload-widget-preview-box">
                            <img class="slide-preview-img ${slide.image ? '' : 'file-input-hidden'}" src="${slide.image || ''}" alt="Slide" />
                            <div class="empty-placeholder slide-placeholder ${slide.image ? 'file-input-hidden' : ''}">
                                <i data-lucide="image"></i>
                                <span>Sin Imagen</span>
                            </div>
                        </div>
                        <div class="image-upload-actions-row">
                            <input type="text" class="form-control slide-img-input" placeholder="URL de la imagen..." value="${slide.image || ''}" />
                            <button type="button" class="btn-upload-file btn-slide-upload">
                                <i data-lucide="upload"></i> Subir
                            </button>
                            <input type="file" class="file-input-hidden slide-file-input" accept="image/*" />
                        </div>
                    </div>
                </div>
                <div class="settings-form-group">
                    <label>Texto Alternativo (Alt / Descripción SEO)</label>
                    <input type="text" class="form-control slide-alt-input" placeholder="Ej: Plato tradicional FOGÓN" value="${slide.alt || ''}" />
                    <span class="hint">Mejora el posicionamiento en Google y la accesibilidad.</span>
                </div>
            </div>
        `;
        container.appendChild(row);

        // Eventos de la fila de slide
        const fileIn = row.querySelector('.slide-file-input') as HTMLInputElement | null;
        const uploadBtn = row.querySelector('.btn-slide-upload') as HTMLButtonElement | null;
        const textIn = row.querySelector('.slide-img-input') as HTMLInputElement | null;
        const previewImg = row.querySelector('.slide-preview-img') as HTMLImageElement | null;
        const placeholder = row.querySelector('.slide-placeholder');
        const delBtn = row.querySelector('.btn-del-slide');

        if (uploadBtn && fileIn) {
            uploadBtn.addEventListener('click', () => fileIn.click());
        }
        if (fileIn && textIn) {
            fileIn.addEventListener('change', async () => {
                if (fileIn.files && fileIn.files[0]) {
                    if (uploadBtn) {
                        uploadBtn.disabled = true;
                        uploadBtn.innerHTML = '<i data-lucide="loader" class="spin"></i>...';
                    }
                    const url = await uploadImageFile(fileIn.files[0]);
                    if (url) {
                        textIn.value = url;
                        setPreviewImage(previewImg, placeholder, url);
                    }
                    if (uploadBtn) {
                        uploadBtn.disabled = false;
                        uploadBtn.innerHTML = '<i data-lucide="upload"></i> Subir';
                    }
                    if (window.lucide) lucide.createIcons();
                }
            });
        }
        if (textIn) {
            textIn.addEventListener('input', () => {
                setPreviewImage(previewImg, placeholder, textIn.value.trim());
            });
        }
        if (delBtn) {
            delBtn.addEventListener('click', () => {
                row.remove();
                renumberSlideBadges();
            });
        }
    });

    if (window.lucide) lucide.createIcons();
}

function renumberSlideBadges() {
    const rows = document.querySelectorAll('.hero-slide-row');
    rows.forEach((r, i) => {
        const badge = r.querySelector('.dynamic-item-badge');
        if (badge) badge.innerHTML = `<i data-lucide="image"></i> Diapositiva #${i + 1}`;
    });
    if (window.lucide) lucide.createIcons();
}

// 2. Hero Stats
function renderHeroStats(stats: any[] = []) {
    const container = document.getElementById('hero-stats-list');
    if (!container) return;
    container.innerHTML = '';

    stats.forEach((st) => {
        const row = document.createElement('div');
        row.className = 'dynamic-item-card hero-stat-row';
        row.innerHTML = `
            <div class="dynamic-item-header">
                <span class="dynamic-item-badge">
                    <i data-lucide="award"></i> Métrica
                </span>
                <button type="button" class="btn-remove-item btn-del-stat" title="Eliminar estadística">
                    <i data-lucide="trash-2"></i> Quitar
                </button>
            </div>
            <div class="settings-grid-2">
                <div class="settings-form-group">
                    <label>Valor Destacado</label>
                    <input type="text" class="form-control stat-value-input" placeholder="Ej: +800 o ⭐ 4.9" value="${st.value || ''}" />
                </div>
                <div class="settings-form-group">
                    <label>Etiqueta / Descripción</label>
                    <input type="text" class="form-control stat-label-input" placeholder="Ej: Pedidos Entregados" value="${st.label || ''}" />
                </div>
            </div>
        `;
        container.appendChild(row);

        const delBtn = row.querySelector('.btn-del-stat');
        if (delBtn) delBtn.addEventListener('click', () => row.remove());
    });

    if (window.lucide) lucide.createIcons();
}

// 3. Beneficios
function renderBenefits(items: any[] = []) {
    const container = document.getElementById('benefits-items-list');
    if (!container) return;
    container.innerHTML = '';

    const iconOptions = ['flame', 'zap', 'award', 'shield', 'truck', 'star', 'heart', 'clock', 'package', 'message-circle', 'sparkles', 'check'];

    items.forEach((item, idx) => {
        const row = document.createElement('div');
        row.className = 'dynamic-item-card benefit-item-row';

        let optionsHtml = '';
        iconOptions.forEach(ico => {
            const isSel = (item.icon === ico) ? 'selected' : '';
            optionsHtml += `<option value="${ico}" ${isSel}>${ico}</option>`;
        });

        row.innerHTML = `
            <div class="dynamic-item-header">
                <span class="dynamic-item-badge">
                    <i data-lucide="check-circle-2"></i> Beneficio #${idx + 1}
                </span>
                <button type="button" class="btn-remove-item btn-del-benefit">
                    <i data-lucide="trash-2"></i> Quitar
                </button>
            </div>
            <div class="settings-grid-2">
                <div class="settings-form-group">
                    <label>Icono</label>
                    <select class="form-control benefit-icon-select">
                        ${optionsHtml}
                    </select>
                </div>
                <div class="settings-form-group">
                    <label>Título del Beneficio</label>
                    <input type="text" class="form-control benefit-title-input" placeholder="Ej: Cocina Artesanal" value="${item.title || ''}" />
                </div>
            </div>
            <div class="settings-form-group">
                <label>Descripción</label>
                <textarea class="form-control benefit-desc-input" rows="2" placeholder="Explica las ventajas de este beneficio...">${item.description || ''}</textarea>
            </div>
        `;
        container.appendChild(row);

        const delBtn = row.querySelector('.btn-del-benefit');
        if (delBtn) delBtn.addEventListener('click', () => row.remove());
    });

    if (window.lucide) lucide.createIcons();
}

// 4. Proceso (Pasos)
function renderProcessSteps(steps: any[] = []) {
    const container = document.getElementById('process-steps-list');
    if (!container) return;
    container.innerHTML = '';

    steps.forEach((step, idx) => {
        const row = document.createElement('div');
        row.className = 'dynamic-item-card process-step-row';
        row.innerHTML = `
            <div class="dynamic-item-header">
                <span class="dynamic-item-badge">
                    <i data-lucide="list-ordered"></i> Paso #${idx + 1}
                </span>
                <button type="button" class="btn-remove-item btn-del-step">
                    <i data-lucide="trash-2"></i> Quitar
                </button>
            </div>
            <div class="settings-grid-2">
                <div class="settings-form-group">
                    <label>Número o Etiqueta</label>
                    <input type="text" class="form-control step-number-input" placeholder="Ej: 1" value="${step.number ?? (idx + 1)}" />
                </div>
                <div class="settings-form-group">
                    <label>Título del Paso</label>
                    <input type="text" class="form-control step-title-input" placeholder="Ej: Elige tu Plato" value="${step.title || ''}" />
                </div>
            </div>
            <div class="settings-form-group">
                <label>Instrucciones / Descripción</label>
                <textarea class="form-control step-desc-input" rows="2" placeholder="Describe lo que el cliente debe hacer...">${step.description || ''}</textarea>
            </div>
        `;
        container.appendChild(row);

        const delBtn = row.querySelector('.btn-del-step');
        if (delBtn) delBtn.addEventListener('click', () => row.remove());
    });

    if (window.lucide) lucide.createIcons();
}

// 5. Testimonios
function renderTestimonials(items: any[] = []) {
    const container = document.getElementById('testimonials-items-list');
    if (!container) return;
    container.innerHTML = '';

    items.forEach((item, idx) => {
        const row = document.createElement('div');
        row.className = 'dynamic-item-card testimonial-item-row';
        row.innerHTML = `
            <div class="dynamic-item-header">
                <span class="dynamic-item-badge">
                    <i data-lucide="star"></i> Reseña #${idx + 1}
                </span>
                <button type="button" class="btn-remove-item btn-del-testimonial">
                    <i data-lucide="trash-2"></i> Quitar
                </button>
            </div>
            <div class="settings-grid-3">
                <div class="settings-form-group">
                    <label>Nombre del Cliente</label>
                    <input type="text" class="form-control test-name-input" placeholder="Ej: María González" value="${item.name || ''}" />
                </div>
                <div class="settings-form-group">
                    <label>Rol o Ubicación</label>
                    <input type="text" class="form-control test-role-input" placeholder="Ej: Cliente frecuente" value="${item.role || ''}" />
                </div>
                <div class="settings-form-group">
                    <label>Calificación (Estrellas)</label>
                    <select class="form-control test-rating-select">
                        <option value="5" ${item.rating === 5 || !item.rating ? 'selected' : ''}>⭐⭐⭐⭐⭐ (5/5)</option>
                        <option value="4" ${item.rating === 4 ? 'selected' : ''}>⭐⭐⭐⭐ (4/5)</option>
                        <option value="3" ${item.rating === 3 ? 'selected' : ''}>⭐⭐⭐ (3/5)</option>
                    </select>
                </div>
            </div>
            <div class="settings-grid-2">
                <div class="settings-form-group">
                    <label>Foto de Avatar</label>
                    <div class="image-upload-widget">
                        <div class="image-upload-widget-preview-box compact">
                            <img class="test-preview-img ${item.avatar ? '' : 'file-input-hidden'}" src="${item.avatar || ''}" alt="Avatar" />
                            <div class="empty-placeholder test-placeholder ${item.avatar ? 'file-input-hidden' : ''}">
                                <i data-lucide="user"></i>
                            </div>
                        </div>
                        <div class="image-upload-actions-row">
                            <input type="text" class="form-control test-avatar-input" placeholder="URL foto..." value="${item.avatar || ''}" />
                            <button type="button" class="btn-upload-file btn-test-upload">
                                <i data-lucide="upload"></i> Subir
                            </button>
                            <input type="file" class="file-input-hidden test-file-input" accept="image/*" />
                        </div>
                    </div>
                </div>
                <div class="settings-form-group">
                    <label>Comentario / Reseña</label>
                    <textarea class="form-control test-review-input" rows="4" placeholder="Lo que dijo el cliente sobre tu servicio...">${item.review || ''}</textarea>
                </div>
            </div>
        `;
        container.appendChild(row);

        const fileIn = row.querySelector('.test-file-input') as HTMLInputElement | null;
        const uploadBtn = row.querySelector('.btn-test-upload') as HTMLButtonElement | null;
        const textIn = row.querySelector('.test-avatar-input') as HTMLInputElement | null;
        const previewImg = row.querySelector('.test-preview-img') as HTMLImageElement | null;
        const placeholder = row.querySelector('.test-placeholder');
        const delBtn = row.querySelector('.btn-del-testimonial');

        if (uploadBtn && fileIn) {
            uploadBtn.addEventListener('click', () => fileIn.click());
        }
        if (fileIn && textIn) {
            fileIn.addEventListener('change', async () => {
                if (fileIn.files && fileIn.files[0]) {
                    if (uploadBtn) {
                        uploadBtn.disabled = true;
                        uploadBtn.innerHTML = '<i data-lucide="loader" class="spin"></i>...';
                    }
                    const url = await uploadImageFile(fileIn.files[0]);
                    if (url) {
                        textIn.value = url;
                        setPreviewImage(previewImg, placeholder, url);
                    }
                    if (uploadBtn) {
                        uploadBtn.disabled = false;
                        uploadBtn.innerHTML = '<i data-lucide="upload"></i> Subir';
                    }
                    if (window.lucide) lucide.createIcons();
                }
            });
        }
        if (textIn) {
            textIn.addEventListener('input', () => {
                setPreviewImage(previewImg, placeholder, textIn.value.trim());
            });
        }
        if (delBtn) delBtn.addEventListener('click', () => row.remove());
    });

    if (window.lucide) lucide.createIcons();
}

// 6. Preguntas Frecuentes (FAQ)
function renderFaq(items: any[] = []) {
    const container = document.getElementById('faq-items-list');
    if (!container) return;
    container.innerHTML = '';

    items.forEach((item, idx) => {
        const row = document.createElement('div');
        row.className = 'dynamic-item-card faq-item-row';
        row.innerHTML = `
            <div class="dynamic-item-header">
                <span class="dynamic-item-badge">
                    <i data-lucide="help-circle"></i> Pregunta #${idx + 1}
                </span>
                <button type="button" class="btn-remove-item btn-del-faq">
                    <i data-lucide="trash-2"></i> Quitar
                </button>
            </div>
            <div class="settings-form-group">
                <label>Pregunta</label>
                <input type="text" class="form-control faq-q-input" placeholder="Ej: ¿Cuáles son las zonas de cobertura del delivery?" value="${item.q || ''}" />
            </div>
            <div class="settings-form-group">
                <label>Respuesta</label>
                <textarea class="form-control faq-a-input" rows="3" placeholder="Redacta la respuesta completa...">${item.a || ''}</textarea>
            </div>
        `;
        container.appendChild(row);

        const delBtn = row.querySelector('.btn-del-faq');
        if (delBtn) delBtn.addEventListener('click', () => row.remove());
    });

    if (window.lucide) lucide.createIcons();
}

// 7. Cuentas de Pago Móvil (Venezuela)
function renderPagoMovilAccounts(items: any[] = []) {
    const container = document.getElementById('pagomovil-items-list');
    if (!container) return;
    container.innerHTML = '';

    const accounts = items.length > 0 ? items : [{ banco: '', telefono: '', cedula: '', titular: '', isDefault: true }];

    accounts.forEach((acc, idx) => {
        const row = document.createElement('div');
        row.className = 'dynamic-item-card pagomovil-item-row';
        const isDefault = acc.isDefault || idx === 0;

        row.innerHTML = `
            <div class="dynamic-item-header">
                <div class="dynamic-item-header-left">
                    <span class="dynamic-item-badge">
                        <i data-lucide="smartphone"></i> Cuenta #${idx + 1}
                    </span>
                    <label class="pm-default-toggle" title="Marcar como cuenta principal">
                        <input type="radio" name="pm-default-account-radio" class="pm-account-default-radio" ${isDefault ? 'checked' : ''} />
                        <span>Cuenta Principal</span>
                    </label>
                </div>
                <button type="button" class="btn-remove-item btn-del-pagomovil" title="Eliminar cuenta">
                    <i data-lucide="trash-2"></i> Quitar
                </button>
            </div>
            <div class="settings-grid-2">
                <div class="settings-form-group">
                    <label>Banco y Código</label>
                    <input type="text" list="venezuelan-banks-list" class="form-control pm-banco-input" placeholder="Ej: Banesco (0134) o Mercantil (0105)" value="${acc.banco || ''}" />
                </div>
                <div class="settings-form-group">
                    <label>Teléfono Afiliado</label>
                    <input type="text" class="form-control pm-telefono-input" placeholder="Ej: 0412-4756191" value="${acc.telefono || ''}" />
                </div>
            </div>
            <div class="settings-grid-2">
                <div class="settings-form-group">
                    <label>Cédula / RIF</label>
                    <input type="text" class="form-control pm-cedula-input" placeholder="Ej: V-12345678 o J-12345678-0" value="${acc.cedula || ''}" />
                </div>
                <div class="settings-form-group">
                    <label>Titular / Alias (Opcional)</label>
                    <input type="text" class="form-control pm-titular-input" placeholder="Ej: Mi Tienda C.A." value="${acc.titular || ''}" />
                </div>
            </div>
        `;
        container.appendChild(row);

        const delBtn = row.querySelector('.btn-del-pagomovil');
        if (delBtn) {
            delBtn.addEventListener('click', () => {
                const totalRows = container.querySelectorAll('.pagomovil-item-row').length;
                if (totalRows <= 1) {
                    showToast('Debes mantener al menos una cuenta de Pago Móvil', 'warning');
                    return;
                }
                const wasDefault = (row.querySelector('.pm-account-default-radio') as HTMLInputElement)?.checked;
                row.remove();
                if (wasDefault) {
                    const firstRadio = container.querySelector('.pm-account-default-radio') as HTMLInputElement | null;
                    if (firstRadio) firstRadio.checked = true;
                }
                container.querySelectorAll('.pagomovil-item-row').forEach((r, i) => {
                    const badge = r.querySelector('.dynamic-item-badge');
                    if (badge) badge.innerHTML = `<i data-lucide="smartphone"></i> Cuenta #${i + 1}`;
                });
                if (window.lucide) lucide.createIcons();
            });
        }
    });

    if (window.lucide) lucide.createIcons();
}

// --- CARGA DE TODAS LAS CONFIGURACIONES DESDE LA API ---
async function loadStoreSettings() {
    try {
        const res = await fetch('/api/settings');
        if (!res.ok) throw new Error('No se pudo cargar la configuración');
        const data = (await res.json()) as any;
        const cfg = data.tenant?.config || {};
        const b = cfg.business || {};
        const c = cfg.contact || {};
        const lnd = cfg.landing || {};
        const h = lnd.hero || {};
        const cat = lnd.catalog || {};
        const ben = lnd.benefits || {};
        const prc = lnd.process || {};
        const tst = lnd.testimonials || {};
        const fq = lnd.faq || {};
        const p = cfg.payment || {};
        const pm = p.pagoMovil || {};
        const z = p.zelle || {};
        const l = cfg.labels || {};

function updateStoreUrls(tenant: any) {
    const template = tenant?.template || 'restaurant';
    const tenantId = tenant?.id;
    let url = `/demo/${template}`;
    if (tenant?.domain) {
        url = `https://${tenant.domain}`;
    } else if (tenantId && tenantId !== 'demo') {
        url = getStoreUrl(tenantId, tenant?.domain);
    }

    const previewBtn = document.getElementById('btn-preview-store') as HTMLAnchorElement | null;
    if (previewBtn) previewBtn.href = url;

    const headerBtn = document.getElementById('btn-header-view-store') as HTMLAnchorElement | null;
    if (headerBtn) headerBtn.href = url;

    activeStoreUrl = url.startsWith('/') ? `${window.location.origin}${url}` : url;
    activeStoreName = tenant?.name || $val('cfg-business-name') || 'Mi Tienda';
    activeStoreTagline = tenant?.config?.business?.tagline || $val('cfg-tagline') || 'Escanea con tu cámara y haz tu pedido';
    refreshStoreQrCodes();
}

        // Actualizar botones de vista previa "Ver Mi Tienda" (en Ajustes y Cabecera)
        updateStoreUrls(data.tenant);

        // TAB 1: IDENTIDAD
        setVal('cfg-store-template', data.tenant?.template || 'restaurant');
        const currentStoreName = b.name || data.tenant?.name || '';
        setVal('cfg-business-name', currentStoreName);
        setVal('cfg-tagline', b.tagline || '');
        setVal('cfg-description', b.description || '');
        setVal('cfg-logo-primary', b.logoTextPrimary || currentStoreName || '');
        setVal('cfg-logo-secondary', b.logoTextSecondary || '');
        setVal('cfg-store-prefix', cfg.storePrefix || '');

        const activePalette = cfg.palette || cfg.theme?.palette || 'default';
        selectPalette(activePalette);

        setVal('cfg-logo-image', b.logoImage || '');
        setPreviewImage(document.getElementById('preview-logo-img'), document.getElementById('placeholder-logo'), b.logoImage);

        setVal('cfg-og-image', b.ogImage || '');
        setPreviewImage(document.getElementById('preview-og-img'), document.getElementById('placeholder-og'), b.ogImage);

        // TAB 2: HERO
        setVal('cfg-hero-badge', h.badgeText || '');
        setVal('cfg-hero-headline', h.headline || '');
        setVal('cfg-hero-headline-highlight', h.headlineHighlight || '');
        setVal('cfg-hero-subheadline', h.subheadline || '');
        setVal('cfg-hero-cta1-text', h.ctaPrimaryText || '');
        setVal('cfg-hero-cta1-link', h.ctaPrimaryLink || '');
        setVal('cfg-hero-cta2-text', h.ctaSecondaryText || '');
        setVal('cfg-hero-cta2-link', h.ctaSecondaryLink || '');

        renderHeroSlides(h.slides || [
            { image: '/assets/hero_main.webp', alt: 'Portada 1' },
            { image: '/assets/hero_grill.webp', alt: 'Portada 2' }
        ]);

        renderHeroStats(h.stats || [
            { value: '+800', label: 'Pedidos Entregados' },
            { value: '⭐ 4.9', label: 'Calificación Promedio' },
            { value: '🚀 Rápido', label: 'Delivery Express' }
        ]);

        // TAB 3: CATÁLOGO
        setVal('cfg-catalog-title', cat.title || '');
        setVal('cfg-catalog-title-highlight', cat.titleHighlight || '');
        setVal('cfg-catalog-subtitle', cat.subtitle || '');
        setVal('cfg-catalog-search-placeholder', cat.searchPlaceholder || '');
        setVal('cfg-catalog-add-cart-text', cat.addToCartText || '');
        setVal('cfg-catalog-empty-msg', cat.emptyMessage || '');
        setVal('cfg-product-detail-view-mode', cat.productDetailViewMode || 'modal');
        setVal('cfg-product-detail-share-btn', cat.productDetailShareBtn || 'enabled');

        setVal('cfg-item-noun-singular', l.itemNounSingular || '');
        setVal('cfg-item-noun-plural', l.itemNounPlural || '');
        setVal('cfg-empty-cart-emoji', l.emptyCartEmoji || '');

        // TAB 4: BENEFICIOS
        setVal('cfg-benefits-title', ben.title || '');
        setVal('cfg-benefits-title-highlight', ben.titleHighlight || '');
        setVal('cfg-benefits-subtitle', ben.subtitle || '');

        renderBenefits(ben.items || [
            { icon: 'flame', title: 'Cocina Artesanal', description: 'Recetas tradicionales preparadas al momento con ingredientes frescos del día.' },
            { icon: 'zap', title: 'Delivery Express', description: 'Tu pedido llega caliente y empacado con cuidado a tiempo.' },
            { icon: 'message-circle', title: 'Pedido por WhatsApp', description: 'Sin apps complicadas. Elige en la web y envía tu orden en un clic.' }
        ]);

        // TAB 5: PROCESO
        setVal('cfg-process-title', prc.title || '');
        setVal('cfg-process-title-highlight', prc.titleHighlight || '');
        setVal('cfg-process-subtitle', prc.subtitle || '');

        renderProcessSteps(prc.steps || [
            { number: 1, title: 'Elige tu Plato', description: 'Explora nuestro menú y selecciona tus opciones favoritas.' },
            { number: 2, title: 'Arma tu Pedido', description: 'Añade tus artículos al carrito y selecciona delivery o retiro.' },
            { number: 3, title: 'Envía por WhatsApp', description: 'Te confirmamos en minutos y preparamos tu orden.' },
            { number: 4, title: '¡Disfruta!', description: 'Recibe en tu puerta o retira en nuestro local.' }
        ]);

        // TAB 6: TESTIMONIOS
        setVal('cfg-testimonials-title', tst.title || '');
        setVal('cfg-testimonials-title-highlight', tst.titleHighlight || '');
        setVal('cfg-testimonials-subtitle', tst.subtitle || '');

        renderTestimonials(tst.items || [
            { name: 'María González', role: 'Cliente frecuente', rating: 5, review: 'La comida llegó caliente y deliciosa. El pedido por WhatsApp fue súper rápido.', avatar: '/assets/client_maria.webp' },
            { name: 'Carlos Rodríguez', role: 'Cliente verificado', rating: 5, review: 'Excelente atención y calidad insuperable. 100% recomendado.', avatar: '/assets/client_jose.webp' }
        ]);

        // TAB 7: FAQ
        setVal('cfg-faq-title', fq.title || '');
        setVal('cfg-faq-title-highlight', fq.titleHighlight || '');
        setVal('cfg-faq-subtitle', fq.subtitle || '');

        renderFaq(fq.items || [
            { q: '¿Cómo pago mi pedido?', a: 'Aceptamos Pago Móvil, Zelle y Efectivo. Puedes adjuntar tu comprobante de pago al ordenar.' },
            { q: '¿Cuánto tarda el delivery?', a: 'Normalmente entre 25 a 45 minutos dependiendo de la zona de entrega.' }
        ]);

        // TAB 8: CONTACTO & PAGOS
        setVal('cfg-whatsapp', c.whatsapp || data.tenant?.whatsapp || '');
        setVal('cfg-whatsapp-display', c.whatsappDisplay || '');
        setVal('cfg-email', c.email || '');
        setVal('cfg-address', c.address || '');
        setVal('cfg-hours', c.hours || '');
        setVal('cfg-instagram', c.instagram || '');
        setVal('cfg-instagram-handle', c.instagramHandle || '');

        const pmAccounts = p.pagoMovilAccounts && Array.isArray(p.pagoMovilAccounts) && p.pagoMovilAccounts.length > 0
            ? p.pagoMovilAccounts
            : (pm.banco || pm.telefono || pm.cedula ? [{ ...pm, isDefault: true }] : []);
        renderPagoMovilAccounts(pmAccounts);

        setVal('cfg-zelle-email', z.email || '');
        setVal('cfg-zelle-titular', z.titular || '');

        setVal('cfg-delivery-name', l.deliveryOptionName || '');
        setVal('cfg-delivery-price', l.deliveryOptionPrice !== undefined ? l.deliveryOptionPrice : '');
        setVal('cfg-pickup-name', l.pickupOptionName || '');

        if (window.lucide) lucide.createIcons();
    } catch (err) {
        console.error('Error al cargar configuración:', err);
        showToast('No se pudo cargar la configuración de la tienda.', 'error');
    }
}

// Inicialización de escuchadores de eventos
initSettingsTabs();
initPalettePicker();
setupSingleImageUploader('btn-upload-logo', 'file-logo-image', 'cfg-logo-image', 'preview-logo-img', 'placeholder-logo');
setupSingleImageUploader('btn-upload-og', 'file-og-image', 'cfg-og-image', 'preview-og-img', 'placeholder-og');

// Selector de Paletas de Colores Preconfiguradas
function selectPalette(paletteId: string) {
    const input = document.getElementById('cfg-store-palette') as HTMLInputElement | null;
    if (input) input.value = paletteId;

    const cards = document.querySelectorAll('.palette-card');
    cards.forEach(card => {
        const id = card.getAttribute('data-palette-id');
        const isActive = id === paletteId;
        card.classList.toggle('active', isActive);
        card.setAttribute('aria-checked', isActive ? 'true' : 'false');
    });
}

function initPalettePicker() {
    const grid = document.getElementById('palette-picker-grid');
    if (!grid) return;

    grid.addEventListener('click', (e) => {
        const card = (e.target as HTMLElement).closest('.palette-card') as HTMLElement | null;
        if (!card) return;

        const paletteId = card.getAttribute('data-palette-id') || 'default';
        selectPalette(paletteId);
    });
}

// Botones de agregar elementos dinámicos
const btnAddSlide = document.getElementById('btn-add-hero-slide');
if (btnAddSlide) {
    btnAddSlide.addEventListener('click', () => {
        const container = document.getElementById('hero-slides-list');
        const count = container ? container.querySelectorAll('.hero-slide-row').length : 0;
        const currentSlides = collectHeroSlides();
        currentSlides.push({ image: '', alt: `Diapositiva ${count + 1}` });
        renderHeroSlides(currentSlides);
    });
}

const btnAddStat = document.getElementById('btn-add-hero-stat');
if (btnAddStat) {
    btnAddStat.addEventListener('click', () => {
        const currentStats = collectHeroStats();
        currentStats.push({ value: '+100', label: 'Nueva Métrica' });
        renderHeroStats(currentStats);
    });
}

const btnAddBenefit = document.getElementById('btn-add-benefit');
if (btnAddBenefit) {
    btnAddBenefit.addEventListener('click', () => {
        const currentBenefits = collectBenefits();
        currentBenefits.push({ icon: 'star', title: 'Nuevo Beneficio', description: 'Describe esta ventaja competitiva...' });
        renderBenefits(currentBenefits);
    });
}

const btnAddStep = document.getElementById('btn-add-process-step');
if (btnAddStep) {
    btnAddStep.addEventListener('click', () => {
        const currentSteps = collectProcessSteps();
        const nextNum = currentSteps.length + 1;
        currentSteps.push({ number: nextNum, title: `Paso ${nextNum}`, description: 'Descripción de este paso...' });
        renderProcessSteps(currentSteps);
    });
}

const btnAddTestimonial = document.getElementById('btn-add-testimonial');
if (btnAddTestimonial) {
    btnAddTestimonial.addEventListener('click', () => {
        const currentTests = collectTestimonials();
        currentTests.push({ name: 'Nuevo Cliente', role: 'Cliente', rating: 5, review: 'Excelente producto y atención.', avatar: '' });
        renderTestimonials(currentTests);
    });
}

const btnAddFaq = document.getElementById('btn-add-faq');
if (btnAddFaq) {
    btnAddFaq.addEventListener('click', () => {
        const currentFaqs = collectFaqs();
        currentFaqs.push({ q: '¿Pregunta frecuente?', a: 'Respuesta correspondiente...' });
        renderFaq(currentFaqs);
    });
}

const btnAddPm = document.getElementById('btn-add-pagomovil');
if (btnAddPm) {
    btnAddPm.addEventListener('click', () => {
        const currentAccounts = collectPagoMovilAccounts();
        currentAccounts.push({
            banco: '',
            telefono: '',
            cedula: '',
            titular: '',
            isDefault: currentAccounts.length === 0,
        });
        renderPagoMovilAccounts(currentAccounts);
    });
}

// Funciones recolectoras de los formularios dinámicos
function collectHeroSlides() {
    const rows = document.querySelectorAll('.hero-slide-row');
    const slides: any[] = [];
    rows.forEach(r => {
        const img = getRowVal(r, '.slide-img-input');
        const alt = getRowVal(r, '.slide-alt-input');
        if (img) slides.push({ image: img, alt: alt || '' });
    });
    return slides;
}

function collectHeroStats() {
    const rows = document.querySelectorAll('.hero-stat-row');
    const stats: any[] = [];
    rows.forEach(r => {
        const val = getRowVal(r, '.stat-value-input');
        const lbl = getRowVal(r, '.stat-label-input');
        if (val && lbl) stats.push({ value: val, label: lbl });
    });
    return stats;
}

function collectBenefits() {
    const rows = document.querySelectorAll('.benefit-item-row');
    const items: any[] = [];
    rows.forEach(r => {
        const icon = getRowVal(r, '.benefit-icon-select');
        const title = getRowVal(r, '.benefit-title-input');
        const desc = getRowVal(r, '.benefit-desc-input');
        if (title) items.push({ icon: icon || 'star', title, description: desc || '' });
    });
    return items;
}

function collectProcessSteps() {
    const rows = document.querySelectorAll('.process-step-row');
    const steps: any[] = [];
    rows.forEach(r => {
        const num = getRowVal(r, '.step-number-input');
        const title = getRowVal(r, '.step-title-input');
        const desc = getRowVal(r, '.step-desc-input');
        if (title) steps.push({ number: num || '1', title, description: desc || '' });
    });
    return steps;
}

function collectTestimonials() {
    const rows = document.querySelectorAll('.testimonial-item-row');
    const items: any[] = [];
    rows.forEach(r => {
        const name = getRowVal(r, '.test-name-input');
        const role = getRowVal(r, '.test-role-input');
        const rating = parseInt(getRowVal(r, '.test-rating-select') || '5', 10);
        const avatar = getRowVal(r, '.test-avatar-input');
        const review = getRowVal(r, '.test-review-input');
        if (name && review) {
            items.push({ name, role: role || 'Cliente', rating, review, avatar: avatar || '' });
        }
    });
    return items;
}

function collectFaqs() {
    const rows = document.querySelectorAll('.faq-item-row');
    const items: any[] = [];
    rows.forEach(r => {
        const q = getRowVal(r, '.faq-q-input');
        const a = getRowVal(r, '.faq-a-input');
        if (q && a) items.push({ q, a });
    });
    return items;
}

function collectPagoMovilAccounts() {
    const rows = document.querySelectorAll('.pagomovil-item-row');
    const items: any[] = [];
    rows.forEach((r, idx) => {
        const banco = getRowVal(r, '.pm-banco-input');
        const telefono = getRowVal(r, '.pm-telefono-input');
        const cedula = getRowVal(r, '.pm-cedula-input');
        const titular = getRowVal(r, '.pm-titular-input');
        const isDefault = (r.querySelector('.pm-account-default-radio') as HTMLInputElement)?.checked || false;
        if (banco || telefono || cedula) {
            items.push({
                id: `pm_${idx + 1}`,
                banco,
                telefono,
                cedula,
                titular: titular || '',
                isDefault,
            });
        }
    });
    if (items.length > 0 && !items.some(a => a.isDefault)) {
        items[0].isDefault = true;
    }
    return items;
}

// Botón de Recargar
const btnReloadSettings = document.getElementById('btn-reload-settings');
if (btnReloadSettings) {
    btnReloadSettings.addEventListener('click', () => {
        loadStoreSettings();
        showToast('Configuración recargada con éxito.', 'info');
    });
}

// Envío del Formulario Completo de Configuración
const storeSettingsForm = document.getElementById('store-settings-form');
if (storeSettingsForm) {
    storeSettingsForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const btnSave = $btn('btn-save-settings');
        if (btnSave) {
            btnSave.disabled = true;
            btnSave.innerHTML = '<i data-lucide="loader" class="spin"></i> Guardando cambios...';
            if (window.lucide) lucide.createIcons();
        }

        const businessName = $val('cfg-business-name') || undefined;
        const logoPrimary = $val('cfg-logo-primary') || businessName || undefined;
        const logoSecondary = $val('cfg-logo-secondary') || undefined;

        const payload = {
            business: {
                name: businessName,
                tagline: $val('cfg-tagline') || undefined,
                description: $val('cfg-description') || undefined,
                logoTextPrimary: logoPrimary,
                logoTextSecondary: logoSecondary,
                logoImage: $val('cfg-logo-image') || undefined,
                ogImage: $val('cfg-og-image') || undefined,
            },
            landing: {
                hero: {
                    badgeText: $val('cfg-hero-badge') || undefined,
                    headline: $val('cfg-hero-headline') || undefined,
                    headlineHighlight: $val('cfg-hero-headline-highlight') || undefined,
                    subheadline: $val('cfg-hero-subheadline') || undefined,
                    ctaPrimaryText: $val('cfg-hero-cta1-text') || undefined,
                    ctaPrimaryLink: $val('cfg-hero-cta1-link') || undefined,
                    ctaSecondaryText: $val('cfg-hero-cta2-text') || undefined,
                    ctaSecondaryLink: $val('cfg-hero-cta2-link') || undefined,
                    slides: collectHeroSlides(),
                    stats: collectHeroStats(),
                },
                catalog: {
                    title: $val('cfg-catalog-title') || undefined,
                    titleHighlight: $val('cfg-catalog-title-highlight') || undefined,
                    subtitle: $val('cfg-catalog-subtitle') || undefined,
                    searchPlaceholder: $val('cfg-catalog-search-placeholder') || undefined,
                    addToCartText: $val('cfg-catalog-add-cart-text') || undefined,
                    emptyMessage: $val('cfg-catalog-empty-msg') || undefined,
                    productDetailViewMode: ($val('cfg-product-detail-view-mode') as 'modal' | 'page') || 'modal',
                    productDetailShareBtn: ($val('cfg-product-detail-share-btn') as 'enabled' | 'disabled') || 'enabled',
                },
                benefits: {
                    title: $val('cfg-benefits-title') || undefined,
                    titleHighlight: $val('cfg-benefits-title-highlight') || undefined,
                    subtitle: $val('cfg-benefits-subtitle') || undefined,
                    items: collectBenefits(),
                },
                process: {
                    title: $val('cfg-process-title') || undefined,
                    titleHighlight: $val('cfg-process-title-highlight') || undefined,
                    subtitle: $val('cfg-process-subtitle') || undefined,
                    steps: collectProcessSteps(),
                },
                testimonials: {
                    title: $val('cfg-testimonials-title') || undefined,
                    titleHighlight: $val('cfg-testimonials-title-highlight') || undefined,
                    subtitle: $val('cfg-testimonials-subtitle') || undefined,
                    items: collectTestimonials(),
                },
                faq: {
                    title: $val('cfg-faq-title') || undefined,
                    titleHighlight: $val('cfg-faq-title-highlight') || undefined,
                    subtitle: $val('cfg-faq-subtitle') || undefined,
                    items: collectFaqs(),
                },
            },
            contact: {
                whatsapp: $val('cfg-whatsapp') || undefined,
                whatsappDisplay: $val('cfg-whatsapp-display') || undefined,
                email: $val('cfg-email') || undefined,
                address: $val('cfg-address') || undefined,
                hours: $val('cfg-hours') || undefined,
                instagram: $val('cfg-instagram') || undefined,
                instagramHandle: $val('cfg-instagram-handle') || undefined,
            },
            payment: {
                pagoMovilAccounts: collectPagoMovilAccounts(),
                pagoMovil: (function() {
                    const accs = collectPagoMovilAccounts();
                    const def = accs.find(a => a.isDefault) || accs[0] || {};
                    return {
                        banco: def.banco || undefined,
                        telefono: def.telefono || undefined,
                        cedula: def.cedula || undefined,
                        titular: def.titular || undefined,
                    };
                })(),
                zelle: {
                    email: $val('cfg-zelle-email') || undefined,
                    titular: $val('cfg-zelle-titular') || undefined,
                }
            },
            labels: {
                deliveryOptionName: $val('cfg-delivery-name') || undefined,
                deliveryOptionPrice: $val('cfg-delivery-price') !== '' ? parseFloat($val('cfg-delivery-price')) : undefined,
                pickupOptionName: $val('cfg-pickup-name') || undefined,
                itemNounSingular: $val('cfg-item-noun-singular') || undefined,
                itemNounPlural: $val('cfg-item-noun-plural') || undefined,
                emptyCartEmoji: $val('cfg-empty-cart-emoji') || undefined,
            },
            template: ($val('cfg-store-template') as any) || undefined,
            palette: $val('cfg-store-palette') || 'default',
            storePrefix: $val('cfg-store-prefix').toUpperCase() || undefined
        };

        try {
            const res = await fetch('/api/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = (await res.json()) as any;
            if (res.ok && data.success) {
                showToast('✅ ¡Toda la tienda ha sido actualizada exitosamente!', 'success');
                if (payload.business.name) {
                    const subTitle = document.getElementById('dashboard-subtitle');
                    if (subTitle && subTitle.textContent.includes('FOGÓN')) {
                        subTitle.textContent = subTitle.textContent.replace('FOGÓN', payload.business.name);
                    }
                }
            } else {
                showToast(data.error || 'Error al guardar la configuración.', 'error');
            }
        } catch (err) {
            console.error('Error al guardar configuración:', err);
            showToast('Error de red al guardar la configuración.', 'error');
        } finally {
            if (btnSave) {
                btnSave.disabled = false;
                btnSave.innerHTML = '<i data-lucide="save"></i> Guardar Todos los Cambios';
                if (window.lucide) lucide.createIcons();
            }
        }
    });
}

// --- GESTIÓN DE CUPONES DE DESCUENTO ---
let couponsList: any[] = [];

async function loadCoupons() {
    try {
        const res = await fetch('/api/coupons');
        if (!res.ok) return;
        const data = (await res.json()) as any;
        couponsList = data.coupons || [];
        renderCouponsTable();
    } catch (e) {
        console.error("Error al cargar cupones:", e);
    }
}

function renderCouponsTable() {
    const tableEl = document.getElementById('table-coupons');
    if (!tableEl) return;

    if (couponsList.length === 0) {
        tableEl.innerHTML = '<tr><td colspan="8" class="table-empty-message">No hay cupones creados aún. Crea el primero arriba.</td></tr>';
        return;
    }

    tableEl.innerHTML = couponsList.map(c => {
        const discountText = c.discount_type === 'percentage' ? `${c.discount_value}%` : `$${parseFloat(c.discount_value).toFixed(2)}`;
        const minOrderText = c.min_order_amount > 0 ? `$${parseFloat(c.min_order_amount).toFixed(2)}` : 'Sin mínimo';
        const usesText = c.max_uses > 0 ? `${c.uses_count} / ${c.max_uses}` : `${c.uses_count} (Ilimitado)`;
        const expiresText = c.expires_at ? new Date(c.expires_at).toLocaleDateString('es-VE') : 'Permanente';
        const isActive = c.active === 1;
        const statusBadge = isActive
            ? '<span class="status-badge completado">Activo</span>'
            : '<span class="status-badge cancelado">Inactivo</span>';

        return `
            <tr>
                <td><code><strong>${escapeHtml(c.code)}</strong></code></td>
                <td>${c.discount_type === 'percentage' ? 'Porcentaje' : 'Monto Fijo'}</td>
                <td><strong class="table-amount-success">${discountText}</strong></td>
                <td>${minOrderText}</td>
                <td>${usesText}</td>
                <td>${expiresText}</td>
                <td>${statusBadge}</td>
                <td>
                    <div class="table-actions-group">
                        <button class="action-icon-btn edit" data-action="toggle-coupon" data-id="${c.id}" data-active="${c.active}" title="${isActive ? 'Desactivar' : 'Activar'}">
                            <i data-lucide="${isActive ? 'pause' : 'play'}" class="table-action-icon-sm"></i>
                        </button>
                        <button class="action-icon-btn delete" data-action="delete-coupon" data-id="${c.id}" title="Eliminar Cupón">
                            <i data-lucide="trash-2" class="table-action-icon-sm"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    if (window.lucide) lucide.createIcons();
}

async function toggleCouponStatus(couponId: number, currentActive: number) {
    try {
        const newActive = currentActive === 1 ? 0 : 1;
        const res = await fetch('/api/coupons', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: couponId, active: newActive })
        });
        if (!res.ok) throw new Error('Error al actualizar');
        showToast(`Cupón ${newActive === 1 ? 'activado' : 'pausado'} con éxito.`, 'success');
        loadCoupons();
    } catch {
        showToast('Error al cambiar estado del cupón.', 'error');
    }
}

async function deleteCoupon(couponId: number) {
    if (!confirm('¿Seguro que deseas eliminar este cupón de descuento?')) return;
    try {
        const res = await fetch(`/api/coupons?id=${couponId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Error al eliminar');
        showToast('Cupón eliminado con éxito.', 'info');
        loadCoupons();
    } catch {
        showToast('Error al eliminar cupón.', 'error');
    }
}

window.toggleCouponStatus = toggleCouponStatus;
window.deleteCoupon = deleteCoupon;

// Toggle formulario de cupón
const btnToggleCouponForm = document.getElementById('btn-toggle-coupon-form');
const couponFormCollapse = document.getElementById('coupon-form-collapse');
if (btnToggleCouponForm && couponFormCollapse) {
    btnToggleCouponForm.addEventListener('click', () => {
        couponFormCollapse.classList.toggle('expanded');
    });
}

// Refresh cupones
const btnRefreshCoupons = document.getElementById('btn-refresh-coupons');
if (btnRefreshCoupons) {
    btnRefreshCoupons.addEventListener('click', loadCoupons);
}

// Submit cupón
const couponForm = document.getElementById('coupon-form') as HTMLFormElement | null;
if (couponForm) {
    couponForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const code = $val('coupon-code').toUpperCase();
        const discountType = $val('coupon-type');
        const discountValue = parseFloat($val('coupon-value'));
        const minOrderAmount = parseFloat($val('coupon-min-order')) || 0;
        const maxUses = parseInt($val('coupon-max-uses')) || -1;
        const expiresAt = $val('coupon-expires-at') || null;

        if (discountType === 'percentage' && (discountValue <= 0 || discountValue > 100)) {
            showToast('El porcentaje de descuento debe estar entre 0.01% y 100%.', 'error');
            return;
        }

        const btnSubmit = $btn('btn-submit-coupon');
        if (btnSubmit) btnSubmit.disabled = true;

        try {
            const res = await fetch('/api/coupons', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    code,
                    discountType,
                    discountValue,
                    minOrderAmount,
                    maxUses: isNaN(maxUses) ? -1 : maxUses,
                    expiresAt: expiresAt ? new Date(expiresAt + 'T23:59:59').toISOString() : null,
                    active: 1
                })
            });

            const data = (await res.json()) as any;
            if (!res.ok) throw new Error(data.error || 'Error al guardar');

            showToast(`¡Cupón ${code} creado exitosamente!`, 'success');
            couponForm.reset();
            if (couponFormCollapse) couponFormCollapse.classList.remove('expanded');
            loadCoupons();
        } catch (err) {
            showToast(err.message || 'Error al crear cupón.', 'error');
        } finally {
            if (btnSubmit) btnSubmit.disabled = false;
        }
    });
}

// ==========================================================================
// FUNCIONALIDAD DE CÓDIGO QR DE LA TIENDA (CONFIGURACIÓN, MODAL & HABLADOR)
// ==========================================================================
let activeStoreUrl = window.location.origin;
let activeStoreName = 'Mi Tienda';
let activeStoreTagline = 'Escanea con tu cámara y haz tu pedido';

async function renderQrToCanvas(canvas: HTMLCanvasElement | null, url: string, size = 260) {
    if (!canvas || !url) return;
    try {
        await QRCode.toCanvas(canvas, url, {
            width: size,
            margin: 2,
            color: {
                dark: '#0f172a',
                light: '#ffffff'
            },
            errorCorrectionLevel: 'H'
        });
    } catch (err) {
        console.error('Error generando QR code:', err);
    }
}

function refreshStoreQrCodes() {
    const finalUrl = activeStoreUrl || (document.getElementById('btn-header-view-store') as HTMLAnchorElement | null)?.href || window.location.origin;
    const businessName = $val('cfg-business-name') || activeStoreName || 'Mi Tienda';
    const tagline = $val('cfg-tagline') || activeStoreTagline || 'Escanea con tu cámara y haz tu pedido';

    // 1. Tarjeta en Configuración (Ajustes -> Identidad)
    const settingsTitle = document.getElementById('settings-qr-store-title');
    if (settingsTitle) settingsTitle.textContent = businessName;
    const settingsUrl = document.getElementById('settings-qr-url-text');
    if (settingsUrl) settingsUrl.textContent = finalUrl;
    const settingsCanvas = document.getElementById('settings-qr-canvas') as HTMLCanvasElement | null;
    if (settingsCanvas) renderQrToCanvas(settingsCanvas, finalUrl, 180);

    // 2. Modal Completo / Hablador Imprimible
    const modalName = document.getElementById('modal-qr-business-name');
    if (modalName) modalName.textContent = businessName;
    const modalTagline = document.getElementById('modal-qr-tagline');
    if (modalTagline) modalTagline.textContent = tagline;
    const modalUrlLabel = document.getElementById('modal-qr-url-label');
    if (modalUrlLabel) modalUrlLabel.textContent = finalUrl;
    const modalCanvas = document.getElementById('modal-qr-canvas') as HTMLCanvasElement | null;
    if (modalCanvas) renderQrToCanvas(modalCanvas, finalUrl, 260);
}

const storeQrModal = document.getElementById('store-qr-modal');

function openStoreQrModal() {
    refreshStoreQrCodes();
    if (storeQrModal) {
        storeQrModal.classList.add('active');
        if (window.lucide) lucide.createIcons();
    }
}

function closeStoreQrModal() {
    if (storeQrModal) storeQrModal.classList.remove('active');
}

function downloadQrCode(canvas: HTMLCanvasElement | null, filename: string) {
    if (!canvas) return;
    try {
        const dataUrl = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = filename || 'codigo-qr-tienda.png';
        link.href = dataUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast('Código QR descargado con éxito', 'success');
    } catch (err) {
        console.error('Error descargando código QR:', err);
        showToast('No se pudo descargar el código QR', 'error');
    }
}

async function copyStoreUrlToClipboard(url: string) {
    if (!url) return;
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(url);
        } else {
            const ta = document.createElement('textarea');
            ta.value = url;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
        }
        showToast('¡Enlace de la tienda copiado al portapapeles!', 'success');
    } catch {
        showToast('No se pudo copiar el enlace', 'error');
    }
}

// Triggers para abrir modal QR
document.getElementById('btn-header-qr')?.addEventListener('click', openStoreQrModal);
document.getElementById('btn-settings-qr')?.addEventListener('click', openStoreQrModal);
document.getElementById('btn-settings-open-full-qr')?.addEventListener('click', openStoreQrModal);

// Cierre modal
document.getElementById('btn-close-qr-modal')?.addEventListener('click', closeStoreQrModal);
if (storeQrModal) {
    storeQrModal.addEventListener('click', (e) => {
        if (e.target === storeQrModal) closeStoreQrModal();
    });
}

// Botones de acciones
document.getElementById('btn-settings-copy-url')?.addEventListener('click', () => {
    const finalUrl = activeStoreUrl || (document.getElementById('btn-header-view-store') as HTMLAnchorElement | null)?.href || window.location.origin;
    copyStoreUrlToClipboard(finalUrl);
});
document.getElementById('btn-modal-copy-qr-url')?.addEventListener('click', () => {
    const finalUrl = activeStoreUrl || (document.getElementById('btn-header-view-store') as HTMLAnchorElement | null)?.href || window.location.origin;
    copyStoreUrlToClipboard(finalUrl);
});

document.getElementById('btn-settings-download-qr')?.addEventListener('click', () => {
    const canvas = document.getElementById('settings-qr-canvas') as HTMLCanvasElement | null;
    const name = ($val('cfg-business-name') || activeStoreName || 'tienda').toLowerCase().replace(/[^a-z0-9]/g, '-');
    downloadQrCode(canvas, `qr-${name}.png`);
});
document.getElementById('btn-modal-download-qr')?.addEventListener('click', () => {
    const canvas = document.getElementById('modal-qr-canvas') as HTMLCanvasElement | null;
    const name = ($val('cfg-business-name') || activeStoreName || 'tienda').toLowerCase().replace(/[^a-z0-9]/g, '-');
    downloadQrCode(canvas, `qr-${name}-mostrador.png`);
});

document.getElementById('btn-modal-print-qr')?.addEventListener('click', () => {
    window.print();
});



