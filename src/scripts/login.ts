const form = document.getElementById('login-form') as HTMLFormElement;
const btn = document.getElementById('login-btn') as HTMLButtonElement;
const errDiv = document.getElementById('login-error') as HTMLElement;

const showError = (msg: string) => {
    errDiv.textContent = msg;
    errDiv.classList.remove('hidden');
};

// Auto-detección de tenant en subdominio
const host = window.location.hostname.toLowerCase();
let detectedTenant: string | null = null;
if (host.endsWith('.ventrina.app') && host !== 'ventrina.app' && !host.startsWith('www.')) {
    detectedTenant = host.slice(0, -'.ventrina.app'.length).split('.').pop() || null;
} else if (host.endsWith('.localhost') && host !== 'localhost') {
    detectedTenant = host.slice(0, -'.localhost'.length).split('.').pop() || null;
}

if (detectedTenant) {
    const tenantInput = document.getElementById('tenant') as HTMLInputElement | null;
    if (tenantInput) {
        tenantInput.value = detectedTenant;
        const tenantField = tenantInput.closest('.field');
        if (tenantField) {
            tenantField.classList.add('hidden');
        }
    }
    const storeBadge = document.querySelector('.store-badge');
    if (storeBadge) {
        storeBadge.innerHTML = `<span>Tienda activa: <strong>${detectedTenant}</strong></span>`;
    }
}

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errDiv.classList.add('hidden');
    btn.disabled = true;
    btn.textContent = 'Verificando...';

    const email = (document.getElementById('email') as HTMLInputElement).value.trim();
    const password = (document.getElementById('password') as HTMLInputElement).value;
    const tenant = (document.getElementById('tenant') as HTMLInputElement)?.value.trim() || detectedTenant || undefined;

    try {
        const res = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, tenant }),
            credentials: 'include',
        });
        const data = await res.json() as { success: boolean; tenant?: string; error?: string };
        if (data.success) {
            try {
                localStorage.setItem('ventrina_last_activity', String(Date.now()));
            } catch {}
            const redirectTenant = data.tenant || tenant;
            const currentHost = window.location.hostname.toLowerCase();
            const isSubdomain = (currentHost.endsWith('.ventrina.app') && currentHost !== 'ventrina.app' && !currentHost.startsWith('www.')) ||
                                (currentHost.endsWith('.localhost') && currentHost !== 'localhost');

            if (isSubdomain) {
                // Ya estamos en el subdominio de la tienda: URL limpia sin parámetros
                window.location.href = '/admin';
            } else if (redirectTenant && redirectTenant !== 'default') {
                if (currentHost === 'ventrina.app') {
                    window.location.href = `https://${redirectTenant}.ventrina.app/admin`;
                } else if (currentHost === 'localhost' || currentHost.endsWith('.localhost')) {
                    const port = window.location.port ? `:${window.location.port}` : '';
                    window.location.href = `${window.location.protocol}//${redirectTenant}.localhost${port}/admin`;
                } else {
                    window.location.href = `/admin?tenant=${encodeURIComponent(redirectTenant)}`;
                }
            } else {
                window.location.href = '/admin';
            }
        } else {
            showError(data.error || 'Credenciales incorrectas.');
        }
    } catch {
        showError('Error de red. Intenta de nuevo.');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Iniciar Sesión';
    }
});
