const form = document.getElementById('login-form') as HTMLFormElement;
const btn = document.getElementById('login-btn') as HTMLButtonElement;
const errDiv = document.getElementById('login-error') as HTMLElement;

const showError = (msg: string) => {
    errDiv.textContent = msg;
    errDiv.style.display = 'block';
};

form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errDiv.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Verificando...';

    const username = (document.getElementById('username') as HTMLInputElement).value.trim();
    const password = (document.getElementById('password') as HTMLInputElement).value;

    try {
        const res = await fetch('/api/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
            credentials: 'include',
        });
        const data = await res.json() as { success: boolean; error?: string };
        if (data.success) {
            window.location.href = '/admin';
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
