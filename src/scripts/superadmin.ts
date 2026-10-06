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
            if(tbody) tbody.innerHTML = `<tr><td colspan="6" style="color:red;text-align:center;">Error al cargar datos.</td></tr>`;
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
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">No hay tiendas registradas.</td></tr>`;
            return;
        }

        const dateOptions: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' };

        tbody.innerHTML = tenants.map(t => {
            const isActive = t.active === 1;
            const statusBadge = isActive 
                ? `<span class="badge badge-active">Activo</span>`
                : `<span class="badge badge-suspended">Suspendido</span>`;
            
            const btnSuspend = isActive
                ? `<button class="btn-suspend" onclick="window.toggleTenant('${t.id}', 0)">Suspender</button>`
                : `<button class="btn-suspend activate" onclick="window.toggleTenant('${t.id}', 1)">Activar</button>`;

            return `
                <tr>
                    <td><strong>${t.id}</strong>.vendly.app</td>
                    <td>${t.name} <br><small style="color:#94a3b8">${t.template}</small></td>
                    <td>
                        <select class="action-select" onchange="window.changePlan('${t.id}', this.value)">
                            <option value="basic" ${t.plan === 'basic' ? 'selected' : ''}>Básico (Lim: 20 prod)</option>
                            <option value="pro" ${t.plan === 'pro' ? 'selected' : ''}>PRO (Lim: 100 prod)</option>
                            <option value="enterprise" ${t.plan === 'enterprise' ? 'selected' : ''}>Enterprise (Ilimitado)</option>
                        </select>
                    </td>
                    <td>${statusBadge}</td>
                    <td>${new Date(t.created_at).toLocaleDateString('es-ES', dateOptions)}</td>
                    <td>${btnSuspend}</td>
                </tr>
            `;
        }).join('');
    }

    // Exponer funciones globalmente para los botones generados dinámicamente
    (window as any).changePlan = async (tenantId: string, newPlan: string) => {
        if (!confirm(`¿Cambiar plan de ${tenantId} a ${newPlan.toUpperCase()}?`)) {
            loadTenants(); // reset select
            return;
        }
        await updateTenant(tenantId, 'change_plan', newPlan);
    };

    (window as any).toggleTenant = async (tenantId: string, newStatus: number) => {
        const actionText = newStatus === 1 ? 'ACTIVAR' : 'SUSPENDER';
        if (!confirm(`¿Estás seguro que deseas ${actionText} a la tienda ${tenantId}?`)) return;
        
        await updateTenant(tenantId, 'toggle_status', newStatus);
    };

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