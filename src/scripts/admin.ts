// src/scripts/admin.ts
// Panel Administrativo - Vendly SaaS
export {};

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
let salesSearchQuery = '';
let productsSearchQuery = '';
let lastKnownOrderCount: number | null = null;
let soundEnabled = localStorage.getItem('admin_sound_enabled') !== 'false';

// Paginación State
let ordersPage = 1;
let ordersTotalPages = 1;
let productsPage = 1;
let productsTotalPages = 1;
let salesPage = 1;
let salesTotalPages = 1;


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

// --- VERIFICACIÓN DE SESIÓN INICIAL ---
async function checkSession() {
    try {
        const res = await fetch('/api/auth');
        const data = (await res.json()) as any;

        if (data.authenticated) {
            currentAdmin = data.username;
            window.currentUserRole = data.role || 'viewer';
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
        loginContainer.style.display = 'flex';
        if (dashboardContainer) dashboardContainer.style.display = 'none';
    } else {
        window.location.href = '/login';
    }
}

function showDashboard() {
    if (loginContainer) loginContainer.style.display = 'none';
    if (dashboardContainer) dashboardContainer.style.display = 'flex';
    
    // Mostrar insignia de admin
    const badge = document.getElementById('user-info-badge');
    const badgeName = document.getElementById('admin-user-name');
    if (badge && badgeName && currentAdmin) {
        badge.style.display = 'flex';
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
        loader.style.opacity = '0';
        setTimeout(() => loader.style.display = 'none', 500);
    }
}

// --- FLUJO DE INICIO Y CIERRE DE SESIÓN ---

// Login Submit
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const username = $val('login-username');
        const passwordPlain = ($input('login-password')?.value || '');
        const submitBtn = $btn('login-btn-submit');

        if (!username || !passwordPlain) return;

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i data-lucide="loader" class="spin"></i> Verificando...';
        }
        if (window.lucide) lucide.createIcons();

        try {
            const passwordHash = await sha256(passwordPlain);

            const res = await fetch('/api/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, passwordHash })
            });

            const data = (await res.json()) as any;

            if (res.ok && data.success) {
                currentAdmin = data.username;
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
            const currentPasswordHash = await sha256(currentPass);
            const newPasswordHash = await sha256(newPass);

            const res = await fetch('/api/auth', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ currentPasswordHash, newPasswordHash })
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
            if (dashboardSubtitle) dashboardSubtitle.textContent = 'Visión global de rendimiento, pedidos y catálogo en FOGÓN.';
        } else if (targetId === 'section-orders') {
            if (dashboardTitle) dashboardTitle.textContent = 'Gestión de Pedidos';
            if (dashboardSubtitle) dashboardSubtitle.textContent = 'Revisa y actualiza el estado de los pedidos recibidos por la web.';
        } else if (targetId === 'section-sales') {
            if (dashboardTitle) dashboardTitle.textContent = 'Registro de Ventas';
            if (dashboardSubtitle) dashboardSubtitle.textContent = 'Histórico de pedidos completados y cobrados exitosamente.';
        } else if (targetId === 'section-inventory') {
            if (dashboardTitle) dashboardTitle.textContent = 'Gestión del Menú';
            if (dashboardSubtitle) dashboardSubtitle.textContent = 'Agrega, edita precios y administra los platillos ofrecidos.';
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

async function loadBillingData() {
    try {
        const res = await fetch('/api/billing');
        if (res.ok) {
            const data = (await res.json()) as any;
            
            // Info de Plan
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
    await Promise.all([
        loadBcvRate(),
        loadOrders(),
        loadProducts(),
        loadSales(),
        loadStats(),
        loadBillingData(),
        loadCoupons()
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
            ordersList = responseData.data || [];
        } else {
            ordersTotalPages = 1;
            ordersList = responseData;
        }

        // Detección de nuevo pedido para reproducir sonido y notificar
        if (lastKnownOrderCount !== null && ordersList.length > lastKnownOrderCount && page === 1) {
            const hasNewPending = ordersList.some(o => o.status === 'pendiente');
            if (hasNewPending) {
                playOrderChime();
                flashPageTitle();
                showToast('🔔 ¡Has recibido un nuevo pedido!', 'info');
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
            productsList = responseData.data || [];
        } else {
            productsTotalPages = 1;
            productsList = responseData;
        }
        
        renderProductsTable();
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
            salesList = responseData.data || [];
        } else {
            salesTotalPages = 1;
            salesList = responseData;
        }
        
        renderSales();
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
        if (metricRevenue) {
            const revenue = parseFloat(data.revenueToday) || 0;
            metricRevenue.textContent = `Bs ${(Math.round(revenue * 100) / 100).toLocaleString('es-VE')}`;
        }
        
        // Renderizar gráfica
        renderChart(data.chartData || []);
        await loadAnalytics();
    } catch (err) {
        console.error(err);
    }
}

async function loadAnalytics() {
    try {
        const res = await fetch('/api/analytics');
        if (!res.ok) return;
        const data = (await res.json()) as any;
        
        // 1. Ingresos Mes Actual y Crecimiento
        const monthRevEl = document.getElementById('metric-month-revenue');
        const growthContainer = document.getElementById('metric-growth-container');
        if (monthRevEl && data.summary) {
            const revMonth = parseFloat(data.summary.revenueThisMonth) || 0;
            monthRevEl.textContent = `Bs ${(Math.round(revMonth * 100) / 100).toLocaleString('es-VE')}`;
            
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
        if (avgTicketEl && data.summary) {
            const avg = parseFloat(data.summary.averageTicket) || 0;
            avgTicketEl.textContent = `Bs ${(Math.round(avg * 100) / 100).toLocaleString('es-VE')}`;
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
                    const name = pm.payment_method === 'pago_movil' ? 'Pago Móvil' :
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
                borderColor: '#c9748a',
                backgroundColor: 'rgba(201, 116, 138, 0.2)',
                borderWidth: 3,
                pointBackgroundColor: '#b8860b',
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
    if (metricProdCount) metricProdCount.textContent = String(productsList.length);

    const pendingOrders = ordersList.filter(o => o.status === 'pendiente');
    const prodOrders = ordersList.filter(o => o.status === 'en_produccion');
    
    const metricPending = document.getElementById('metric-pending-orders');
    if (metricPending) metricPending.textContent = String(pendingOrders.length);

    const metricProd = document.getElementById('metric-prod-orders');
    if (metricProd) metricProd.textContent = String(prodOrders.length);

    const metricSalesCount = document.getElementById('metric-sales-count');
    
    if (metricSalesCount) {
        metricSalesCount.textContent = String(salesList.length);
    }
    
    // Actualizar badge del sidebar
    const badgeOrders = document.getElementById('sidebar-badge-orders');
    if (badgeOrders) {
        if (pendingOrders.length > 0) {
            badgeOrders.textContent = String(pendingOrders.length);
            badgeOrders.style.display = 'inline-block';
        } else {
            badgeOrders.style.display = 'none';
        }
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

    // Filtrar pedidos según búsqueda y estado
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

    // 1. Render en tabla general
    if (tableAll) {
        if (filteredOrders.length === 0) {
            tableAll.innerHTML = `<tr><td colspan="7" class="table-empty-message">${(ordersSearchQuery || ordersStatusFilter) ? 'No hay pedidos que coincidan con los filtros aplicados.' : 'No hay pedidos en la base de datos.'}</td></tr>`;
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
            if (receiptContainer) receiptContainer.style.display = 'block';
            if (receiptThumb) (receiptThumb as HTMLImageElement).src = order.payment_receipt;
            if (receiptDownloadBtn) (receiptDownloadBtn as HTMLAnchorElement).href = order.payment_receipt;
            if (receiptModalImg) (receiptModalImg as HTMLImageElement).src = order.payment_receipt;
        } else {
            if (receiptContainer) receiptContainer.style.display = 'none';
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
                if (deliveryAddressContainer) deliveryAddressContainer.style.display = 'block';
                if (deliveryAddressElem) deliveryAddressElem.textContent = order.delivery_address || 'No especificada';
                
                if (order.delivery_notes) {
                    if (deliveryNotesContainer) deliveryNotesContainer.style.display = 'block';
                    if (deliveryNotesElem) deliveryNotesElem.textContent = order.delivery_notes;
                } else {
                    if (deliveryNotesContainer) deliveryNotesContainer.style.display = 'none';
                }
            } else {
                if (deliveryAddressContainer) deliveryAddressContainer.style.display = 'none';
                if (deliveryNotesContainer) deliveryNotesContainer.style.display = 'none';
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
            paymentMethodElem.textContent = paymentLabels[order.payment_method] || order.payment_method || 'Por acordar';
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

        // Configurar botón de chatear
        const btnChat = document.getElementById('btn-modal-chat') as HTMLAnchorElement | null;
        if (btnChat) {
            const cleanPhone = String(order.client_phone || '').replace(/[^\d]/g, '');
            const businessName = $val('cfg-business-name') || 'nuestra tienda';
            const message = `¡Hola ${order.client_name}! Te contactamos de *${businessName}* con respecto a tu pedido *#${order.id}*...`;
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
        paymentMethodSelect.value = targetOrder.payment_method;
    }
    if (paymentReferenceInput) {
        paymentReferenceInput.value = targetOrder?.payment_reference || '';
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
        
        try {
            const response = await fetch('/api/orders', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: orderId, status: status, paymentMethod: paymentMethodString })
            });

            if (!response.ok) throw new Error('Error al actualizar estado');
            
            showToast(`Pedido #${orderId} completado y venta registrada.`, 'success');
            
            if (paymentModal) {
                paymentModal.classList.remove('active');
            }
            pendingPaymentOrderId = null;
            pendingPaymentStatus = null;
            
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

    // Actualizar contadores de las pestañas
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

    // Filtrar lista según pestaña activa
    let filteredProducts = activeProductTemplateFilter === 'all'
        ? productsList
        : productsList.filter(p => (p.template || 'restaurant') === activeProductTemplateFilter);

    if (productsSearchQuery) {
        const q = productsSearchQuery.toLowerCase();
        filteredProducts = filteredProducts.filter(p =>
            (p.name && p.name.toLowerCase().includes(q)) ||
            (p.id && p.id.toLowerCase().includes(q)) ||
            (p.category && p.category.toLowerCase().includes(q))
        );
    }

    if (filteredProducts.length === 0) {
        tableProducts.innerHTML = `<tr><td colspan="10" class="table-empty-message">${productsSearchQuery ? 'No se encontraron productos que coincidan con la búsqueda.' : 'No hay productos registrados en esta plantilla. Agrega uno nuevo arriba.'}</td></tr>`;
        return;
    }

    tableProducts.innerHTML = filteredProducts.map(p => {
        const sizesText = p.sizes || 'N/A';
        const priceText = p.price > 0 ? `$${parseFloat(p.price).toFixed(2)}` : '$0.00';
        const statusText = p.active === 1 ? 'Disponible' : 'Agotado';
        const statusClass = p.active === 1 ? 'completado' : 'cancelado';
        const categoryLabel = p.category || p.type_id || 'general';
        const tmpl = p.template || 'restaurant';
        const badge = templateBadges[tmpl] || `<span class="template-badge">${escapeHtml(tmpl)}</span>`;

        const stockVal = p.stock !== undefined && p.stock !== null ? p.stock : -1;
        let stockHtml = '';
        if (stockVal === -1) {
            stockHtml = '<span class="status-badge table-badge-stock-unlimited">♾️ Ilimitado</span>';
        } else if (stockVal <= 0) {
            stockHtml = '<span class="status-badge cancelado">0 (Agotado)</span>';
        } else if (stockVal <= 5) {
            stockHtml = `<span class="status-badge pendiente">${stockVal} (Bajo)</span>`;
        } else {
            stockHtml = `<span class="status-badge completado">${stockVal} disp.</span>`;
        }

        return `
            <tr>
                <td>
                    <img src="${escapeHtml((p.image_url && (p.image_url.startsWith('http') || p.image_url.startsWith('/'))) ? p.image_url : `/${p.image_url || 'assets/favicon.svg'}`)}" alt="${escapeHtml(p.name)}" onerror="this.onerror=null; this.src='/assets/favicon.svg';" class="table-product-thumb">
                </td>
                <td><code>${escapeHtml(p.id)}</code></td>
                <td><strong>${escapeHtml(p.name)}</strong></td>
                <td>${badge}</td>
                <td><span class="table-badge-category">${escapeHtml(categoryLabel)}</span></td>
                <td>${priceText}</td>
                <td>${stockHtml}</td>
                <td class="table-text-secondary">${escapeHtml(sizesText)}</td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td>
                    <div class="table-actions-group">
                        <button class="action-icon-btn edit" data-action="edit-product" data-id="${escapeHtml(p.id)}" title="Editar Producto">
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
                    stock: isNaN(stock) ? -1 : stock
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
    setVal('prod-icon', product.icon || '');
    
    setVal('prod-image', product.image_url || '');
    const imgFileIn = $input('prod-image-file'); if (imgFileIn) imgFileIn.value = ''; // Reset file input
    if (imagePreviewEl && product.image_url) {
        const url = (product.image_url.startsWith('http') || product.image_url.startsWith('/')) ? product.image_url : `/${product.image_url}`;
        imagePreviewEl.style.backgroundImage = `url('${url}')`;
        imagePreviewEl.style.display = 'block';
    } else if (imagePreviewEl) {
        imagePreviewEl.style.display = 'none';
    }

    setVal('prod-sizes', product.sizes || '');
    setVal('prod-stock', (product.stock !== undefined && product.stock !== null) ? product.stock : -1);
    setVal('prod-brand', product.brand || '');
    setVal('prod-model', product.model || '');
    setVal('prod-active', product.active !== undefined ? product.active : 1);
    setVal('prod-description', product.description || '');

    if (formProductTitle) formProductTitle.textContent = `Editando Producto: ${product.name}`;
    if (btnSubmitProduct) btnSubmitProduct.innerHTML = '<i data-lucide="save"></i> Actualizar Producto';
    if (btnCancelEdit) btnCancelEdit.style.display = 'inline-flex';
    
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
    const idInReset = $input('prod-id'); if (idInReset) idInReset.disabled = false; setVal('prod-id', '');
    setVal('prod-template', 'restaurant');
    setVal('prod-stock', '-1');
    if (imagePreviewEl) imagePreviewEl.style.display = 'none';
    const ife = $input('prod-image-file'); if (ife) ife.value = '';
    
    if (formProductTitle) formProductTitle.textContent = 'Añadir Nuevo Producto';
    if (btnSubmitProduct) btnSubmitProduct.innerHTML = '<i data-lucide="plus-circle"></i> Guardar Producto';
    if (btnCancelEdit) btnCancelEdit.style.display = 'none';
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

// Live preview de imagen por URL
const prodImageInput = document.getElementById('prod-image');
if (prodImageInput) {
    prodImageInput.addEventListener('input', (e) => {
        const val = (e.target as HTMLSelectElement).value.trim();
        const preview = document.getElementById('prod-image-preview');
        if (preview) {
            if (val) {
                preview.style.backgroundImage = `url('${val}')`;
                preview.style.display = 'block';
            } else {
                preview.style.display = 'none';
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

document.addEventListener('click', (e) => {
    // Orders Pagination
    const t = e.target as HTMLElement | null;
    if (t?.closest('#btn-orders-prev') && ordersPage > 1) loadOrders(ordersPage - 1);
    if (t?.closest('#btn-orders-next') && ordersPage < ordersTotalPages) loadOrders(ordersPage + 1);
    
    // Products Pagination
    if (t?.closest('#btn-products-prev') && productsPage > 1) loadProducts(productsPage - 1);
    if (t?.closest('#btn-products-next') && productsPage < productsTotalPages) loadProducts(productsPage + 1);
    
    // Sales Pagination
    if (t?.closest('#btn-sales-prev') && salesPage > 1) {
        const dFrom = $val('sales-date-from');
        const dTo = $val('sales-date-to');
        loadSales(dFrom, dTo, salesPage - 1);
    }
    if (t?.closest('#btn-sales-next') && salesPage < salesTotalPages) {
        const dFrom = $val('sales-date-from');
        const dTo = $val('sales-date-to');
        loadSales(dFrom, dTo, salesPage + 1);
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
    downloadCSV(`pedidos_vendly_${dateStr}.csv`, csv);
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
    downloadCSV(`ventas_vendly_${dateStr}.csv`, csv);
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
        connectionStatus.style.background = 'rgba(34, 197, 94, 0.1)';
        connectionStatus.style.borderColor = 'rgba(34, 197, 94, 0.3)';
        const dotSuccess = connectionStatus.querySelector('.status-dot') as HTMLElement | null;
        if (dotSuccess) { dotSuccess.style.background = 'var(--success)'; dotSuccess.style.boxShadow = '0 0 8px var(--success)'; }
        connectionStatusText.style.color = 'var(--success)';
        connectionStatusText.textContent = 'En línea';
        // Refrescar al reconectar
        if (currentAdmin) refreshAllData();
    } else {
        connectionStatus.classList.remove('online');
        connectionStatus.classList.add('offline');
        connectionStatus.style.background = 'rgba(239, 68, 68, 0.1)';
        connectionStatus.style.borderColor = 'rgba(239, 68, 68, 0.3)';
        const dotDanger = connectionStatus.querySelector('.status-dot') as HTMLElement | null;
        if (dotDanger) { dotDanger.style.background = 'var(--danger)'; dotDanger.style.boxShadow = '0 0 8px var(--danger)'; }
        connectionStatusText.style.color = 'var(--danger)';
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

        // Actualizar botón de vista previa "Ver Mi Tienda"
        const previewBtn = document.getElementById('btn-preview-store') as HTMLAnchorElement | null;
        if (previewBtn) {
            const template = data.tenant?.template || 'restaurant';
            const tenantId = data.tenant?.id;
            if (data.tenant?.domain) {
                previewBtn.href = `https://${data.tenant.domain}`;
            } else if (tenantId && tenantId !== 'demo') {
                previewBtn.href = `/${tenantId}`;
            } else {
                previewBtn.href = `/demo/${template}`;
            }
        }

        // TAB 1: IDENTIDAD
        setVal('cfg-business-name', b.name || data.tenant?.name || '');
        setVal('cfg-tagline', b.tagline || '');
        setVal('cfg-description', b.description || '');
        setVal('cfg-logo-primary', b.logoTextPrimary || '');
        setVal('cfg-logo-secondary', b.logoTextSecondary || '');
        setVal('cfg-store-prefix', cfg.storePrefix || '');

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

        setVal('cfg-pm-banco', pm.banco || '');
        setVal('cfg-pm-telefono', pm.telefono || '');
        setVal('cfg-pm-cedula', pm.cedula || '');

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
setupSingleImageUploader('btn-upload-logo', 'file-logo-image', 'cfg-logo-image', 'preview-logo-img', 'placeholder-logo');
setupSingleImageUploader('btn-upload-og', 'file-og-image', 'cfg-og-image', 'preview-og-img', 'placeholder-og');

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

        const payload = {
            business: {
                name: $val('cfg-business-name') || undefined,
                tagline: $val('cfg-tagline') || undefined,
                description: $val('cfg-description') || undefined,
                logoTextPrimary: $val('cfg-logo-primary') || undefined,
                logoTextSecondary: $val('cfg-logo-secondary') || undefined,
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
                pagoMovil: {
                    banco: $val('cfg-pm-banco') || undefined,
                    telefono: $val('cfg-pm-telefono') || undefined,
                    cedula: $val('cfg-pm-cedula') || undefined,
                },
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
                    expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
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



