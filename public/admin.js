// Lógica del Panel Administrativo - FOGÓN Restaurante

// Variables de estado
let currentAdmin = null;
let ordersList = [];
let productsList = [];
let salesList = [];
let currentBcvRate = 853.50;
let currentBcvAuto = true;
let lastBcvUpdated = '';
let lastBcvSource = '';
let ordersSearchQuery = '';
let ordersStatusFilter = '';
let salesSearchQuery = '';
let productsSearchQuery = '';
let lastKnownOrderCount = null;
let soundEnabled = localStorage.getItem('admin_sound_enabled') !== 'false';

// Paginación State
let ordersPage = 1;
let ordersTotalPages = 1;
let productsPage = 1;
let productsTotalPages = 1;
let salesPage = 1;
let salesTotalPages = 1;

// Elementos del DOM
const loader = document.getElementById('page-loader');
const loginContainer = document.getElementById('login-container');
const dashboardContainer = document.getElementById('dashboard-container');
const loginForm = document.getElementById('login-form');
const btnLogout = document.getElementById('btn-logout');
const toastContainer = document.getElementById('toast-container');

// Navegación Sidebar
const sidebarLinks = document.querySelectorAll('.sidebar-link[data-target]');
const sections = document.querySelectorAll('.dashboard-section');
const dashboardTitle = document.getElementById('dashboard-title');
const dashboardSubtitle = document.getElementById('dashboard-subtitle');

// Formularios e Inventario
const productForm = document.getElementById('product-form');
const btnCancelEdit = document.getElementById('btn-cancel-edit');
const formProductTitle = document.getElementById('form-product-title');
const btnSubmitProduct = document.getElementById('btn-submit-product');
const btnToggleProductForm = document.getElementById('btn-toggle-product-form');

// Modal Detalles Pedido
const orderModal = document.getElementById('order-detail-modal');
const btnCloseModal = document.getElementById('btn-close-modal');
const btnCloseModalFooter = document.getElementById('btn-modal-close-footer');

// Modal Registrar Pago
const paymentModal = document.getElementById('payment-modal');
const btnClosePaymentModal = document.getElementById('btn-close-payment-modal');
const btnCancelPaymentModal = document.getElementById('btn-cancel-payment-modal');
const paymentForm = document.getElementById('payment-form');
const paymentMethodSelect = document.getElementById('payment-method-select');
const paymentReferenceInput = document.getElementById('payment-reference');
const referenceGroup = document.getElementById('reference-group');
const paymentModalOrderId = document.getElementById('payment-modal-order-id');

// Modal Cambiar Contraseña
const changePasswordModal = document.getElementById('change-password-modal');
const btnOpenChangePassword = document.getElementById('btn-open-change-password');
const btnClosePasswordModal = document.getElementById('btn-close-password-modal');
const btnCancelPasswordModal = document.getElementById('btn-cancel-password-modal');
const changePasswordForm = document.getElementById('change-password-form');

let pendingPaymentOrderId = null;
let pendingPaymentStatus = null;

// --- UTILIDAD DE SANITIZACIÓN CONTRA STORED XSS ---
function escapeHtml(str) {
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
async function sha256(password) {
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
function showToast(message, type = 'success') {
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
        const data = await res.json();

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
        
        const username = document.getElementById('login-username').value.trim();
        const passwordPlain = document.getElementById('login-password').value;
        const submitBtn = document.getElementById('login-btn-submit');

        if (!username || !passwordPlain) return;

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i data-lucide="loader" class="spin"></i> Verificando...';
        if (window.lucide) lucide.createIcons();

        try {
            const passwordHash = await sha256(passwordPlain);

            const res = await fetch('/api/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, passwordHash })
            });

            const data = await res.json();

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
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'Iniciar Sesión <i data-lucide="arrow-right"></i>';
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

        const currentPass = document.getElementById('current-password-input')?.value;
        const newPass = document.getElementById('new-password-input')?.value;
        const confirmPass = document.getElementById('confirm-password-input')?.value;
        const submitBtn = document.getElementById('btn-submit-password');

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

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i data-lucide="loader" class="spin"></i> Actualizando...';
        if (window.lucide) lucide.createIcons();

        try {
            const currentPasswordHash = await sha256(currentPass);
            const newPasswordHash = await sha256(newPass);

            const res = await fetch('/api/auth', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ currentPasswordHash, newPasswordHash })
            });

            const data = await res.json();

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
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i data-lucide="save"></i> Actualizar Clave';
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
        const ordersTab = document.querySelector('.sidebar-link[data-target="section-orders"]');
        if (ordersTab) ordersTab.click();
    });
});

// --- CARGA Y RENDERIZACIÓN DE DATOS ---


// Cargar Tasa Oficial BCV
async function loadBcvRate() {
    try {
        const res = await fetch('/api/bcv');
        if (res.ok) {
            const data = await res.json();
            currentBcvRate = parseFloat(data.rate) || 853.50;
            currentBcvAuto = data.autoUpdate !== false;
            lastBcvUpdated = data.lastUpdated || '';
            lastBcvSource = data.source || 'bcv_api';

            const display = document.getElementById('admin-bcv-val');
            if (display) display.textContent = `${currentBcvRate.toFixed(2)} Bs.`;
            
            const input = document.getElementById('bcv-rate-input');
            const toggle = document.getElementById('bcv-auto-toggle');
            const syncLabel = document.getElementById('bcv-last-sync-label') || document.getElementById('bcv-last-sync-text');
            if (input) input.value = currentBcvRate.toFixed(2);
            if (toggle) toggle.checked = currentBcvAuto;
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
            const data = await res.json();
            
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
                document.getElementById('billing-orders-limit').textContent = data.usage.ordersThisMonth.limit;
                document.getElementById('billing-orders-bar').style.width = data.usage.ordersThisMonth.percentage + '%';
                document.getElementById('billing-orders-percent').textContent = data.usage.ordersThisMonth.percentage + '% utilizado';
            }
            
            // Consumo de Productos
            const elProdCurrent = document.getElementById('billing-products-current');
            if (elProdCurrent) {
                elProdCurrent.textContent = data.usage.products.current;
                document.getElementById('billing-products-limit').textContent = data.usage.products.limit;
                document.getElementById('billing-products-bar').style.width = data.usage.products.percentage + '%';
                document.getElementById('billing-products-percent').textContent = data.usage.products.percentage + '% utilizado';
            }
            
            // Pagos
            const elBank = document.getElementById('pay-bank');
            if (elBank) {
                elBank.textContent = data.billing.bank;
                document.getElementById('pay-phone').textContent = data.billing.phone;
                document.getElementById('pay-id').textContent = data.billing.id;
                document.getElementById('pay-binance').textContent = data.billing.binancePay;
                document.getElementById('pay-zelle').textContent = data.billing.zelle;
                document.getElementById('pay-amount').textContent = data.billing.monthlyPriceUsd;
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
        loadBillingData()
    ]);
    renderMetrics();
}

// 1. Cargar Pedidos de la API
async function loadOrders(page = 1) {
    try {
        ordersPage = page;
        const res = await fetch(`/api/orders?page=${page}&limit=50`);
        if (!res.ok) throw new Error('No autorizado');
        const responseData = await res.json();
        
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
        const responseData = await res.json();
        
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
async function loadSales(dateFrom = null, dateTo = null, page = 1) {
    try {
        salesPage = page;
        let url = '/api/sales';
        const params = new URLSearchParams();
        if (dateFrom) params.append('date_from', dateFrom);
        if (dateTo) params.append('date_to', dateTo);
        params.append('page', page);
        params.append('limit', 50);
        
        if (params.toString()) {
            url += '?' + params.toString();
        }
        
        const res = await fetch(url);
        if (!res.ok) throw new Error('No autorizado');
        const responseData = await res.json();
        
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
let salesChartInstance = null;
async function loadStats() {
    try {
        const res = await fetch('/api/sales?stats=true');
        if (!res.ok) throw new Error('No autorizado');
        const data = await res.json();
        
        // Actualizar métrica de ingresos de hoy
        const metricRevenue = document.getElementById('metric-revenue');
        if (metricRevenue) {
            const revenue = parseFloat(data.revenueToday) || 0;
            metricRevenue.textContent = `Bs ${(Math.round(revenue * 100) / 100).toLocaleString('es-VE')}`;
        }
        
        // Renderizar gráfica
        renderChart(data.chartData || []);
    } catch (err) {
        console.error(err);
    }
}

function renderChart(chartData) {
    const ctx = document.getElementById('salesChart');
    if (!ctx) return;
    
    // Preparar etiquetas (fechas) y datos (totales)
    // Si no hay datos, mostrar 7 días vacíos
    const labels = [];
    const totals = [];
    
    // Asegurar 7 días
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        
        labels.push(d.toLocaleDateString('es-VE', { weekday: 'short', day: 'numeric' }));
        
        const dayData = chartData.find(c => c.date === dateStr);
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
                        label: function(context) {
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
                        callback: function(value) {
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
        tableSales.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-secondary);">${salesSearchQuery ? 'No se encontraron ventas que coincidan con la búsqueda.' : 'No se han registrado ventas completadas todavía.'}</td></tr>`;
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
                <td><code style="font-weight: 700; color: var(--primary);">${escapeHtml(s.order_id)}</code></td>
                <td>${escapeHtml(s.client_name)}</td>
                <td>${escapeHtml(s.client_phone)}</td>
                <td style="font-weight: 700; color: var(--success);">$${montoVal.toFixed(2)}</td>
                <td><span style="background: rgba(34, 197, 94, 0.1); color: var(--success); padding: 0.25rem 0.5rem; border-radius: 6px; font-size: 0.8rem; font-weight: 600;">${escapeHtml(s.metodo_pago)}</span></td>
                <td style="font-size: 0.85rem; color: var(--text-secondary);">${dateString}</td>
            </tr>
        `;
    }).join('');

    if (window.lucide) lucide.createIcons();
}

// --- RENDER DE MÉTRICAS ---
function renderMetrics() {
    const metricProdCount = document.getElementById('metric-prod-count');
    if (metricProdCount) metricProdCount.textContent = productsList.length;

    const pendingOrders = ordersList.filter(o => o.status === 'pendiente');
    const prodOrders = ordersList.filter(o => o.status === 'en_produccion');
    
    const metricPending = document.getElementById('metric-pending-orders');
    if (metricPending) metricPending.textContent = pendingOrders.length;

    const metricProd = document.getElementById('metric-prod-orders');
    if (metricProd) metricProd.textContent = prodOrders.length;

    const completedOrders = ordersList.filter(o => o.status === 'completado');
    const metricSalesCount = document.getElementById('metric-sales-count');
    
    if (metricSalesCount) {
        metricSalesCount.textContent = salesList.length;
    }
    
    // Actualizar badge del sidebar
    const badgeOrders = document.getElementById('sidebar-badge-orders');
    if (badgeOrders) {
        if (pendingOrders.length > 0) {
            badgeOrders.textContent = pendingOrders.length;
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
            tableAll.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-secondary);">${(ordersSearchQuery || ordersStatusFilter) ? 'No hay pedidos que coincidan con los filtros aplicados.' : 'No hay pedidos en la base de datos.'}</td></tr>`;
        } else {
            tableAll.innerHTML = filteredOrders.map(o => createOrderRowMarkup(o)).join('');
        }
    }

    // 2. Render en tabla recientes (máximo 5)
    if (tableRecent) {
        if (ordersList.length === 0) {
            tableRecent.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-secondary);">No hay pedidos recientes.</td></tr>`;
        } else {
            const recent = ordersList.slice(0, 5);
            tableRecent.innerHTML = recent.map(o => createOrderRowMarkup(o, false)).join('');
        }
    }

    if (window.lucide) lucide.createIcons();
}

function createOrderRowMarkup(order, includeStatusSelector = true) {
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
            <select class="status-select" onchange="updateOrderStatus('${escapeHtml(order.id)}', this.value)">
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
        const receiptBadge = hasReceipt ? ' <span title="Comprobante de pago adjunto" style="cursor:help;">📸</span>' : '';
        return `
        <tr>
            <td><strong>#${escapeHtml(order.id)}</strong>${receiptBadge}</td>
            <td>${escapeHtml(order.client_name)}</td>
            <td>${escapeHtml(order.client_phone)}</td>
            <td>${escapeHtml(order.total_items)}</td>
            <td style="font-weight: 600; color: var(--primary);">${priceText}</td>
            <td style="font-size:0.8rem; color:var(--text-secondary);">${dateString}</td>
            <td>${statusSelector}</td>
            <td>
                <div style="display:flex; gap:0.5rem;">
                    <button class="action-icon-btn edit" onclick="viewOrderDetails('${escapeHtml(order.id)}')" title="Ver Detalles">
                        <i data-lucide="eye" style="width:18px; height:18px;"></i>
                    </button>
                    <button class="action-icon-btn delete" onclick="deleteOrder('${escapeHtml(order.id)}')" title="Eliminar Pedido">
                        <i data-lucide="trash-2" style="width:18px; height:18px;"></i>
                    </button>
                </div>
            </td>
        </tr>
    `;
}

// Actualizar estado de un pedido (Invocado desde onchange en la tabla)
async function updateOrderStatus(orderId, newStatus) {
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
        
        showToast(`Pedido #${orderId} actualizado a "${newStatus.replace('_', ' ')}"`, 'success');
        refreshAllData();
    } catch (err) {
        console.error(err);
        showToast('Error al actualizar el estado del pedido.', 'error');
    }
}

// Eliminar un pedido
async function deleteOrder(orderId) {
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
async function viewOrderDetails(orderId) {
    try {
        const res = await fetch(`/api/orders?id=${encodeURIComponent(orderId)}`);
        if (!res.ok) throw new Error('Error al obtener detalles');
        const order = await res.json();

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
            if (receiptThumb) receiptThumb.src = order.payment_receipt;
            if (receiptDownloadBtn) receiptDownloadBtn.href = order.payment_receipt;
            if (receiptModalImg) receiptModalImg.src = order.payment_receipt;
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
                itemsList.innerHTML = `<p style="color:var(--text-secondary); text-align:center;">No hay detalles de productos registrados.</p>`;
            } else {
                itemsList.innerHTML = order.items.map(item => {
                    const sizeText = item.size ? ` [${escapeHtml(item.size)}]` : '';
                    const unitPrice = parseFloat(item.unit_price) || 0.0;
                    const subtotal = unitPrice * item.quantity;

                    return `
                        <div class="detail-item" style="align-items: center;">
                            <div class="detail-item-info">
                                <div class="detail-item-icon">
                                    <i data-lucide="utensils"></i>
                                </div>
                                <div class="detail-item-name">
                                    <h4>${escapeHtml(item.product_name)}</h4>
                                    <span>ID: ${escapeHtml(item.product_id)}${sizeText}</span>
                                </div>
                            </div>
                            <div style="text-align: right; display: flex; flex-direction: column; gap: 0.2rem; font-family: 'Outfit', sans-serif;">
                                <div class="detail-item-qty" style="font-size: 1.05rem; font-weight: 600; color: var(--primary);">
                                    x${item.quantity}
                                </div>
                                <div style="font-size: 0.75rem; color: var(--text-secondary);">
                                    Precio: $${unitPrice.toFixed(2)}
                                </div>
                                <div style="font-size: 0.8rem; font-weight: 500; color: var(--success);">
                                    Subtotal: $${subtotal.toFixed(2)}
                                </div>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        }

        // Configurar botón de chatear
        const btnChat = document.getElementById('btn-modal-chat');
        if (btnChat) {
            const cleanPhone = String(order.client_phone || '').replace(/[^\d]/g, '');
            const message = `¡Hola ${order.client_name}! Te contactamos de *FOGÓN Restaurante* con respecto a tu pedido *#${order.id}*...`;
            btnChat.href = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
        }

        orderModal.classList.add('active');
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
function openPaymentModal(orderId, newStatus) {
    pendingPaymentOrderId = orderId;
    pendingPaymentStatus = newStatus;
    if (paymentModalOrderId) {
        paymentModalOrderId.textContent = `#${orderId}`;
    }
    
    const targetOrder = ordersList.find(o => o.id === orderId);
    const amountInput = document.getElementById('payment-amount');
    if (amountInput && targetOrder) {
        amountInput.value = parseFloat(targetOrder.total_price || 0).toFixed(2);
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
        
        const btnConfirm = document.getElementById('btn-confirm-payment');
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

    if (countAll) countAll.textContent = productsList.length;
    if (countRest) countRest.textContent = productsList.filter(p => (p.template || 'restaurant') === 'restaurant').length;
    if (countHard) countHard.textContent = productsList.filter(p => p.template === 'hardware').length;
    if (countFash) countFash.textContent = productsList.filter(p => p.template === 'fashion').length;
    if (countTech) countTech.textContent = productsList.filter(p => p.template === 'tech').length;
    if (countAuto) countAuto.textContent = productsList.filter(p => p.template === 'autoparts').length;

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
        tableProducts.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-secondary); padding: 2rem;">${productsSearchQuery ? 'No se encontraron productos que coincidan con la búsqueda.' : 'No hay productos registrados en esta plantilla. Agrega uno nuevo arriba.'}</td></tr>`;
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

        return `
            <tr>
                <td>
                    <img src="${escapeHtml((p.image_url && (p.image_url.startsWith('http') || p.image_url.startsWith('/'))) ? p.image_url : `/${p.image_url || 'assets/favicon.svg'}`)}" alt="${escapeHtml(p.name)}" onerror="this.onerror=null; this.src='/assets/favicon.svg';" style="width:44px; height:44px; object-fit:cover; border-radius:8px; border:1px solid var(--border-color);">
                </td>
                <td><code>${escapeHtml(p.id)}</code></td>
                <td><strong>${escapeHtml(p.name)}</strong></td>
                <td>${badge}</td>
                <td><span style="font-size:0.8rem; background:rgba(255,255,255,0.03); padding:0.25rem 0.5rem; border-radius:6px;">${escapeHtml(categoryLabel)}</span></td>
                <td>${priceText}</td>
                <td style="font-size:0.85rem; color:var(--text-secondary);">${escapeHtml(sizesText)}</td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td>
                    <div style="display:flex; gap:0.5rem;">
                        <button class="action-icon-btn edit" onclick="startEditProduct('${escapeHtml(p.id)}')" title="Editar Producto">
                            <i data-lucide="edit-3" style="width:18px; height:18px;"></i>
                        </button>
                        <button class="action-icon-btn delete" onclick="deleteProduct('${escapeHtml(p.id)}')" title="Eliminar Producto">
                            <i data-lucide="trash-2" style="width:18px; height:18px;"></i>
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
        const btn = e.target.closest('.filter-tab-btn');
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
        const selectedTmpl = e.target.value;
        const catSelect = document.getElementById('prod-category');
        if (catSelect && templateDefaultCategory[selectedTmpl]) {
            catSelect.value = templateDefaultCategory[selectedTmpl];
        }
    });
}

// Enviar formulario (Crear / Editar Producto)
if (productForm) {
    productForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const method = document.getElementById('prod-method')?.value || 'POST';
        const id = document.getElementById('prod-id')?.value.trim();
        const template = document.getElementById('prod-template')?.value || 'restaurant';
        const name = document.getElementById('prod-name')?.value.trim();
        const category = document.getElementById('prod-category')?.value.trim();
        const price = parseFloat(document.getElementById('prod-price')?.value) || 0.0;
        const icon = document.getElementById('prod-icon')?.value.trim();
        let image_url = document.getElementById('prod-image')?.value.trim();
        const sizes = document.getElementById('prod-sizes')?.value.trim();
        const active = parseInt(document.getElementById('prod-active')?.value) || 1;
        const description = document.getElementById('prod-description')?.value.trim();
        
        const imageFile = document.getElementById('prod-image-file')?.files[0];

        const btnSave = document.getElementById('btn-submit-product');
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
                const uploadData = await uploadRes.json();
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
                    id, name, template, category, price, icon, image_url, sizes: sizes || null, active, description
                })
            });

            const data = await response.json();

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
function startEditProduct(productId) {
    const product = productsList.find(p => p.id === productId);
    if (!product) return;

    const methodEl = document.getElementById('prod-method');
    const idEl = document.getElementById('prod-id');
    const templateEl = document.getElementById('prod-template');
    const nameEl = document.getElementById('prod-name');
    const categoryEl = document.getElementById('prod-category');
    const priceEl = document.getElementById('prod-price');
    const iconEl = document.getElementById('prod-icon');
    const imageEl = document.getElementById('prod-image');
    const imageFileEl = document.getElementById('prod-image-file');
    const imagePreviewEl = document.getElementById('prod-image-preview');
    const sizesEl = document.getElementById('prod-sizes');
    const activeEl = document.getElementById('prod-active');
    const descEl = document.getElementById('prod-description');

    if (methodEl) methodEl.value = 'PUT';
    if (idEl) {
        idEl.value = product.id;
        idEl.disabled = true;
    }
    if (templateEl) templateEl.value = product.template || 'restaurant';
    if (nameEl) nameEl.value = product.name;
    if (categoryEl) categoryEl.value = product.category || product.type_id || 'principales';
    if (priceEl) priceEl.value = product.price;
    if (iconEl) iconEl.value = product.icon || '';
    
    if (imageEl) imageEl.value = product.image_url || '';
    if (imageFileEl) imageFileEl.value = ''; // Reset file input
    if (imagePreviewEl && product.image_url) {
        const url = (product.image_url.startsWith('http') || product.image_url.startsWith('/')) ? product.image_url : `/${product.image_url}`;
        imagePreviewEl.style.backgroundImage = `url('${url}')`;
        imagePreviewEl.style.display = 'block';
    } else if (imagePreviewEl) {
        imagePreviewEl.style.display = 'none';
    }

    if (sizesEl) sizesEl.value = product.sizes || '';
    if (activeEl) activeEl.value = product.active !== undefined ? product.active : 1;
    if (descEl) descEl.value = product.description || '';

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
    const methodEl = document.getElementById('prod-method');
    const idEl = document.getElementById('prod-id');
    const templateEl = document.getElementById('prod-template');
    const imagePreviewEl = document.getElementById('prod-image-preview');
    const imageFileEl = document.getElementById('prod-image-file');
    
    if (methodEl) methodEl.value = 'POST';
    if (idEl) idEl.disabled = false;
    if (templateEl) templateEl.value = 'restaurant';
    if (imagePreviewEl) imagePreviewEl.style.display = 'none';
    if (imageFileEl) imageFileEl.value = '';
    
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
async function deleteProduct(productId) {
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
        const val = e.target.value.trim();
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
    const input = document.getElementById('bcv-rate-input');
    if (input) input.value = currentBcvRate.toFixed(2);
    const toggle = document.getElementById('bcv-auto-toggle');
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
        const rateInput = document.getElementById('bcv-rate-input');
        const autoToggle = document.getElementById('bcv-auto-toggle');
        const newRate = parseFloat(rateInput?.value);
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
            const data = await res.json();
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
const btnForceBcvSync = document.getElementById('btn-force-bcv-sync');
if (btnForceBcvSync) {
    btnForceBcvSync.addEventListener('click', async () => {
        btnForceBcvSync.disabled = true;
        const originalHTML = btnForceBcvSync.innerHTML;
        btnForceBcvSync.innerHTML = '<i data-lucide="loader" class="spin"></i> Sincronizando...';
        if (window.lucide) lucide.createIcons();

        try {
            const res = await fetch('/api/bcv?force=true');
            const data = await res.json();
            if (res.ok && data.rate) {
                currentBcvRate = parseFloat(data.rate);
                currentBcvAuto = data.autoUpdate !== false;
                lastBcvUpdated = data.lastUpdated || '';
                lastBcvSource = data.source || 'bcv_api';

                const input = document.getElementById('bcv-rate-input');
                if (input) input.value = currentBcvRate.toFixed(2);
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
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
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
let titleFlashTimer = null;

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
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
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
        ordersStatusFilter = e.target.value;
        renderOrders();
    });
}

// Buscador de Ventas
const salesSearchInput = document.getElementById('sales-search-input');
if (salesSearchInput) {
    salesSearchInput.addEventListener('input', debounce((e) => {
        salesSearchQuery = e.target.value.trim();
        renderSales();
    }, 300));
}

const btnFilterSalesDates = document.getElementById('btn-filter-sales-dates');
if (btnFilterSalesDates) {
    btnFilterSalesDates.addEventListener('click', () => {
        const dateFrom = document.getElementById('sales-date-from').value;
        const dateTo = document.getElementById('sales-date-to').value;
        loadSales(dateFrom, dateTo);
    });
}

// Buscador de Productos
const productsSearchInput = document.getElementById('products-search-input');
if (productsSearchInput) {
    productsSearchInput.addEventListener('input', debounce((e) => {
        productsSearchQuery = e.target.value.trim();
        renderProductsTable();
    }, 300));
}

// --- EXPORTACIÓN DE REPORTES A CSV (EXCEL FRIENDLY) ---

// --- PAGINATION UI & EVENTS ---
function updatePaginationUI(type, currentPage, totalPages) {
    const btnPrev = document.getElementById(`btn-${type}-prev`);
    const btnNext = document.getElementById(`btn-${type}-next`);
    const pageInfo = document.getElementById(`${type}-page-info`);
    
    if (btnPrev && btnNext && pageInfo) {
        pageInfo.textContent = `Página ${currentPage} de ${totalPages}`;
        btnPrev.disabled = currentPage <= 1;
        btnNext.disabled = currentPage >= totalPages;
    }
}

document.addEventListener('click', (e) => {
    // Orders Pagination
    if (e.target.closest('#btn-orders-prev') && ordersPage > 1) loadOrders(ordersPage - 1);
    if (e.target.closest('#btn-orders-next') && ordersPage < ordersTotalPages) loadOrders(ordersPage + 1);
    
    // Products Pagination
    if (e.target.closest('#btn-products-prev') && productsPage > 1) loadProducts(productsPage - 1);
    if (e.target.closest('#btn-products-next') && productsPage < productsTotalPages) loadProducts(productsPage + 1);
    
    // Sales Pagination
    if (e.target.closest('#btn-sales-prev') && salesPage > 1) {
        const dFrom = document.getElementById('sales-date-from')?.value;
        const dTo = document.getElementById('sales-date-to')?.value;
        loadSales(dFrom, dTo, salesPage - 1);
    }
    if (e.target.closest('#btn-sales-next') && salesPage < salesTotalPages) {
        const dFrom = document.getElementById('sales-date-from')?.value;
        const dTo = document.getElementById('sales-date-to')?.value;
        loadSales(dFrom, dTo, salesPage + 1);
    }
});

function downloadCSV(filename, csvContent) {
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
        connectionStatus.querySelector('.status-dot').style.background = 'var(--success)';
        connectionStatus.querySelector('.status-dot').style.boxShadow = '0 0 8px var(--success)';
        connectionStatusText.style.color = 'var(--success)';
        connectionStatusText.textContent = 'En línea';
        // Refrescar al reconectar
        if (currentAdmin) refreshAllData();
    } else {
        connectionStatus.classList.remove('online');
        connectionStatus.classList.add('offline');
        connectionStatus.style.background = 'rgba(239, 68, 68, 0.1)';
        connectionStatus.style.borderColor = 'rgba(239, 68, 68, 0.3)';
        connectionStatus.querySelector('.status-dot').style.background = 'var(--danger)';
        connectionStatus.querySelector('.status-dot').style.boxShadow = '0 0 8px var(--danger)';
        connectionStatusText.style.color = 'var(--danger)';
        connectionStatusText.textContent = 'Sin Conexión';
    }
}

// --- GESTIÓN DE CONFIGURACIÓN DE TIENDA (CRUD DE AJUSTES) ---
async function loadStoreSettings() {
    try {
        const res = await fetch('/api/settings');
        if (!res.ok) throw new Error('No se pudo cargar la configuración');
        const data = await res.json();
        const cfg = data.tenant?.config || {};
        const b = cfg.business || {};
        const c = cfg.contact || {};
        const p = cfg.payment || {};
        const pm = p.pagoMovil || {};
        const z = p.zelle || {};
        const l = cfg.labels || {};

        // Identidad
        const nameEl = document.getElementById('cfg-business-name');
        if (nameEl) nameEl.value = b.name || data.tenant?.name || '';
        const tagEl = document.getElementById('cfg-tagline');
        if (tagEl) tagEl.value = b.tagline || '';
        const descEl = document.getElementById('cfg-description');
        if (descEl) descEl.value = b.description || '';
        const lpEl = document.getElementById('cfg-logo-primary');
        if (lpEl) lpEl.value = b.logoTextPrimary || '';
        const lsEl = document.getElementById('cfg-logo-secondary');
        if (lsEl) lsEl.value = b.logoTextSecondary || '';
        const prefEl = document.getElementById('cfg-store-prefix');
        if (prefEl) prefEl.value = cfg.storePrefix || '';

        // Contacto
        const waEl = document.getElementById('cfg-whatsapp');
        if (waEl) waEl.value = c.whatsapp || data.tenant?.whatsapp || '';
        const waDispEl = document.getElementById('cfg-whatsapp-display');
        if (waDispEl) waDispEl.value = c.whatsappDisplay || '';
        const emailEl = document.getElementById('cfg-email');
        if (emailEl) emailEl.value = c.email || '';
        const addrEl = document.getElementById('cfg-address');
        if (addrEl) addrEl.value = c.address || '';
        const hoursEl = document.getElementById('cfg-hours');
        if (hoursEl) hoursEl.value = c.hours || '';

        // Pago Móvil
        const pmBancoEl = document.getElementById('cfg-pm-banco');
        if (pmBancoEl) pmBancoEl.value = pm.banco || '';
        const pmTelEl = document.getElementById('cfg-pm-telefono');
        if (pmTelEl) pmTelEl.value = pm.telefono || '';
        const pmCedEl = document.getElementById('cfg-pm-cedula');
        if (pmCedEl) pmCedEl.value = pm.cedula || '';

        // Zelle
        const zEmailEl = document.getElementById('cfg-zelle-email');
        if (zEmailEl) zEmailEl.value = z.email || '';
        const zTitEl = document.getElementById('cfg-zelle-titular');
        if (zTitEl) zTitEl.value = z.titular || '';

        // Delivery & Carrito
        const delNameEl = document.getElementById('cfg-delivery-name');
        if (delNameEl) delNameEl.value = l.deliveryOptionName || '';
        const delPriceEl = document.getElementById('cfg-delivery-price');
        if (delPriceEl) delPriceEl.value = l.deliveryOptionPrice !== undefined ? l.deliveryOptionPrice : '';
        const pickNameEl = document.getElementById('cfg-pickup-name');
        if (pickNameEl) pickNameEl.value = l.pickupOptionName || '';
        const nounSinEl = document.getElementById('cfg-item-noun-singular');
        if (nounSinEl) nounSinEl.value = l.itemNounSingular || '';
        const nounPluEl = document.getElementById('cfg-item-noun-plural');
        if (nounPluEl) nounPluEl.value = l.itemNounPlural || '';
        const emojiEl = document.getElementById('cfg-empty-cart-emoji');
        if (emojiEl) emojiEl.value = l.emptyCartEmoji || '';
    } catch (err) {
        console.error('Error al cargar configuración:', err);
        showToast('No se pudo cargar la configuración de la tienda.', 'error');
    }
}

const btnReloadSettings = document.getElementById('btn-reload-settings');
if (btnReloadSettings) {
    btnReloadSettings.addEventListener('click', () => {
        loadStoreSettings();
        showToast('Configuración recargada.', 'info');
    });
}

const storeSettingsForm = document.getElementById('store-settings-form');
if (storeSettingsForm) {
    storeSettingsForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const btnSave = document.getElementById('btn-save-settings');
        if (btnSave) {
            btnSave.disabled = true;
            btnSave.innerHTML = '<i data-lucide="loader" class="spin"></i> Guardando cambios...';
            if (window.lucide) lucide.createIcons();
        }

        const payload = {
            business: {
                name: document.getElementById('cfg-business-name')?.value.trim() || undefined,
                tagline: document.getElementById('cfg-tagline')?.value.trim() || undefined,
                description: document.getElementById('cfg-description')?.value.trim() || undefined,
                logoTextPrimary: document.getElementById('cfg-logo-primary')?.value.trim() || undefined,
                logoTextSecondary: document.getElementById('cfg-logo-secondary')?.value.trim() || undefined,
            },
            contact: {
                whatsapp: document.getElementById('cfg-whatsapp')?.value.trim() || undefined,
                whatsappDisplay: document.getElementById('cfg-whatsapp-display')?.value.trim() || undefined,
                email: document.getElementById('cfg-email')?.value.trim() || undefined,
                address: document.getElementById('cfg-address')?.value.trim() || undefined,
                hours: document.getElementById('cfg-hours')?.value.trim() || undefined,
            },
            payment: {
                pagoMovil: {
                    banco: document.getElementById('cfg-pm-banco')?.value.trim() || undefined,
                    telefono: document.getElementById('cfg-pm-telefono')?.value.trim() || undefined,
                    cedula: document.getElementById('cfg-pm-cedula')?.value.trim() || undefined,
                },
                zelle: {
                    email: document.getElementById('cfg-zelle-email')?.value.trim() || undefined,
                    titular: document.getElementById('cfg-zelle-titular')?.value.trim() || undefined,
                }
            },
            labels: {
                deliveryOptionName: document.getElementById('cfg-delivery-name')?.value.trim() || undefined,
                deliveryOptionPrice: document.getElementById('cfg-delivery-price')?.value !== '' 
                    ? parseFloat(document.getElementById('cfg-delivery-price').value) 
                    : undefined,
                pickupOptionName: document.getElementById('cfg-pickup-name')?.value.trim() || undefined,
                itemNounSingular: document.getElementById('cfg-item-noun-singular')?.value.trim() || undefined,
                itemNounPlural: document.getElementById('cfg-item-noun-plural')?.value.trim() || undefined,
                emptyCartEmoji: document.getElementById('cfg-empty-cart-emoji')?.value.trim() || undefined,
            },
            storePrefix: document.getElementById('cfg-store-prefix')?.value.trim().toUpperCase() || undefined
        };

        try {
            const res = await fetch('/api/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            if (res.ok && data.success) {
                showToast('✅ ¡Configuración guardada exitosamente!', 'success');
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


