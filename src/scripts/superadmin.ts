export {};

let masterToken = sessionStorage.getItem('sa_token') || '';

    const loginStep = document.getElementById('sa-login-step');
    const dashboardStep = document.getElementById('sa-dashboard-step');
    const loginBtn = document.getElementById('sa-login-btn');
    const passInput = document.getElementById('sa-password') as HTMLInputElement;
    const errorMsg = document.getElementById('sa-error');
    const tbody = document.getElementById('sa-tenants-list');

    if (masterToken) {
        showDashboard();
    }

    loginBtn?.addEventListener('click', async () => {
        const pass = passInput.value.trim();
        if(!pass) return;
        
        masterToken = `Bearer ${pass}`;
        
        try {
            const res = await fetch('/api/superadmin/tenants', {
                headers: { 'Authorization': masterToken }
            });
            
            if (res.ok) {
                sessionStorage.setItem('sa_token', masterToken);
                showDashboard();
            } else {
                errorMsg!.textContent = 'Contraseña incorrecta';
                errorMsg!.classList.remove('hidden');
                masterToken = '';
            }
        } catch(e) {
            errorMsg!.textContent = 'Error de conexión';
            errorMsg!.classList.remove('hidden');
        }
    });

    document.getElementById('sa-logout-btn')?.addEventListener('click', () => {
        sessionStorage.removeItem('sa_token');
        masterToken = '';
        dashboardStep!.classList.add('hidden');
        loginStep!.classList.remove('hidden');
        passInput.value = '';
    });

    async function showDashboard() {
        loginStep!.classList.add('hidden');
        dashboardStep!.classList.remove('hidden');
        await loadTenants();
    }

    async function loadTenants() {
        try {
            const res = await fetch('/api/superadmin/tenants', {
                headers: { 'Authorization': masterToken }
            });
            
            if (!res.ok) {
                if (res.status === 401) {
                    sessionStorage.removeItem('sa_token');
                    window.location.reload();
                    return;
                }
                throw new Error();
            }

            const tenants = (await res.json()) as any[];
            renderTable(tenants);
            updateStats(tenants);
        } catch {
            if(tbody) tbody.innerHTML = `<tr><td colspan="7" class="sa-table-center sa-error">Error al cargar datos.</td></tr>`;
        }
    }

    function updateStats(tenants: any[]) {
        const active = tenants.filter(t => t.active === 1).length;
        document.getElementById('stat-total')!.textContent = String(tenants.length);
        document.getElementById('stat-active')!.textContent = String(active);
        document.getElementById('stat-suspended')!.textContent = String(tenants.length - active);
    }

    function renderTable(tenants: any[]) {
        if(!tbody) return;
        
        if (tenants.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="sa-table-center">No hay tiendas registradas.</td></tr>`;
            return;
        }

        const dateOptions: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' };

        tbody.innerHTML = tenants.map(t => {
            const isActive = t.active === 1;
            const statusBadge = isActive 
                ? `<span class="badge badge-active">Activo</span>`
                : `<span class="badge badge-suspended">Suspendido</span>`;
            
            const btnSuspend = isActive
                ? `<button class="btn-suspend" data-action="toggle-status" data-tenant-id="${t.id}" data-status="0">Suspender</button>`
                : `<button class="btn-suspend activate" data-action="toggle-status" data-tenant-id="${t.id}" data-status="1">Activar</button>`;

            const prodCount = Number(t.product_count || 0);
            const orderCount = Number(t.order_count_month || 0);
            const revMonth = Number(t.revenue_month || 0);
            const maxProd = t.plan === 'basic' ? 20 : t.plan === 'pro' ? 100 : '∞';
            const isNearLimit = typeof maxProd === 'number' && prodCount >= maxProd;
            const usageBadgeClass = isNearLimit ? 'sa-usage-badge limit-warning' : 'sa-usage-badge';

            return `
                <tr>
                    <td><a href="https://${t.id}.ventrina.app" target="_blank">${t.id}.ventrina.app</a></td>
                    <td>${t.name} <br><small class="text-muted">${t.template}</small></td>
                    <td>
                        <select class="action-select" data-action="change-plan" data-tenant-id="${t.id}">
                            <option value="basic" ${t.plan === 'basic' ? 'selected' : ''}>Básico (Lim: 20 prod)</option>
                            <option value="pro" ${t.plan === 'pro' ? 'selected' : ''}>PRO (Lim: 100 prod)</option>
                            <option value="enterprise" ${t.plan === 'enterprise' ? 'selected' : ''}>Enterprise (Ilimitado)</option>
                        </select>
                    </td>
                    <td>
                        <span class="${usageBadgeClass}">${prodCount} / ${maxProd} prod.</span>
                        <div class="sa-usage-sub">${orderCount} pedidos este mes ($${revMonth.toFixed(2)})</div>
                    </td>
                    <td>${statusBadge}</td>
                    <td>${new Date(t.created_at).toLocaleDateString('es-ES', dateOptions)}</td>
                    <td>${btnSuspend}</td>
                </tr>
            `;
        }).join('');
    }

    // Delegación de eventos para evitar inline onclick / onchange
    if (tbody) {
        tbody.addEventListener('change', async (e) => {
            const target = e.target as HTMLElement | null;
            if (target && target.matches('select[data-action="change-plan"]')) {
                const select = target as unknown as HTMLSelectElement;
                const tenantId = select.dataset.tenantId;
                if (!tenantId) return;
                const newPlan = select.value;
                if (!confirm(`¿Cambiar plan de ${tenantId} a ${newPlan.toUpperCase()}?`)) {
                    loadTenants();
                    return;
                }
                await updateTenant(tenantId, 'change_plan', newPlan);
            }
        });

        tbody.addEventListener('click', async (e) => {
            const target = e.target as HTMLElement | null;
            const btn = target?.closest('button[data-action="toggle-status"]') as HTMLButtonElement | null;
            if (btn) {
                const tenantId = btn.dataset.tenantId;
                const newStatus = Number(btn.dataset.status);
                if (!tenantId) return;
                const actionText = newStatus === 1 ? 'ACTIVAR' : 'SUSPENDER';
                if (!confirm(`¿Estás seguro que deseas ${actionText} a la tienda ${tenantId}?`)) return;
                await updateTenant(tenantId, 'toggle_status', newStatus);
            }
        });
    }

    async function updateTenant(tenantId: string, action: string, value: any) {
        try {
            const res = await fetch('/api/superadmin/tenants', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': masterToken
                },
                body: JSON.stringify({ tenantId, action, value })
            });

            if (res.ok) {
                alert('Guardado exitosamente.');
                loadTenants();
            } else {
                const data = (await res.json()) as any;
                alert(data.error || 'Error al guardar.');
            }
        } catch {
            alert('Error de red.');
        }
    }