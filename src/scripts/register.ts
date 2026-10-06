
    document.addEventListener('DOMContentLoaded', () => {
        const form = document.getElementById('onboarding-form') as HTMLFormElement;
        const nextBtns = document.querySelectorAll('.next-step');
        const prevBtns = document.querySelectorAll('.prev-step');
        const errorMsg = document.getElementById('error-message')!;
        const submitBtn = document.getElementById('submit-btn') as HTMLButtonElement;
        const successState = document.getElementById('success-state')!;
        const tenantNameInput = document.getElementById('tenantName') as HTMLInputElement;
        const tenantSlugInput = document.getElementById('tenantSlug') as HTMLInputElement;
        const dynamicBg = document.getElementById('dynamic-bg') as HTMLElement;
        
        // Cambio dinámico de fondo
        const bgs: Record<string, string> = {
            restaurant: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&q=80&w=2000',
            hardware: 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?auto=format&fit=crop&q=80&w=2000',
            autoparts: 'https://images.unsplash.com/photo-1486006920555-c77dcf18193c?auto=format&fit=crop&q=80&w=2000',
            fashion: 'https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?auto=format&fit=crop&q=80&w=2000',
            tech: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&q=80&w=2000'
        };

        const templateRadios = document.querySelectorAll('input[name="template"]');
        templateRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                const target = e.target as HTMLInputElement;
                if (target.checked && dynamicBg) {
                    // Preload and switch
                    const img = new Image();
                    img.src = bgs[target.value];
                    img.onload = () => {
                        dynamicBg.style.backgroundImage = `url('${bgs[target.value]}')`;
                    };
                }
            });
        });
        
        // Auto-generar slug basado en el nombre
        tenantNameInput.addEventListener('input', () => {
            if (!tenantSlugInput.dataset.manual) {
                const slug = tenantNameInput.value
                    .toLowerCase()
                    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Quitar acentos
                    .replace(/[^a-z0-9\s-]/g, '') // Quitar caracteres especiales
                    .replace(/\s+/g, '-') // Espacios por guiones
                    .replace(/-+/g, '-') // Evitar guiones multiples
                    .replace(/^-|-$/g, ''); // Trim guiones
                tenantSlugInput.value = slug;
            }
        });

        tenantSlugInput.addEventListener('input', () => {
            tenantSlugInput.dataset.manual = "true";
            // Forzar formato válido
            tenantSlugInput.value = tenantSlugInput.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
        });

        // Navegación de pasos
        nextBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                // Validación básica HTML5 antes de avanzar
                const currentStep = btn.closest('.form-step');
                const inputs = currentStep?.querySelectorAll('input[required]');
                let valid = true;
                inputs?.forEach(input => {
                    if (!(input as HTMLInputElement).checkValidity()) {
                        (input as HTMLInputElement).reportValidity();
                        valid = false;
                    }
                });

                if (valid) {
                    const targetId = (btn as HTMLElement).dataset.target;
                    document.querySelectorAll('.form-step').forEach(step => step.classList.remove('active'));
                    document.getElementById(targetId!)?.classList.add('active');
                }
            });
        });

        prevBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const targetId = (btn as HTMLElement).dataset.target;
                document.querySelectorAll('.form-step').forEach(step => step.classList.remove('active'));
                document.getElementById(targetId!)?.classList.add('active');
            });
        });

        // Submit form
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            errorMsg.classList.add('hidden');
            submitBtn.disabled = true;
            submitBtn.querySelector('.btn-text')?.classList.add('hidden');
            submitBtn.querySelector('.spinner')?.classList.remove('hidden');

            const formData = new FormData(form);
            const passwordStr = formData.get('password') as string;
            
            const payload = {
                tenantName: formData.get('tenantName'),
                tenantSlug: formData.get('tenantSlug'),
                template: formData.get('template'),
                username: formData.get('username'),
                password: passwordStr,
                whatsapp: formData.get('whatsapp') || null
            };

            try {
                const response = await fetch('/api/onboarding', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                const data = (await response.json()) as any;

                if (response.ok) {
                    form.classList.add('hidden');
                    document.querySelector('.header')?.classList.add('hidden');
                    successState.classList.remove('hidden');
                    
                    const protocol = window.location.protocol;
                    const hostParts = window.location.host.split('.');
                    
                    let baseDomain = window.location.host;
                    if (hostParts.length > 2 && hostParts[0] !== 'www') {
                        baseDomain = hostParts.slice(1).join('.');
                    }
                    
                    if (baseDomain.startsWith('localhost') || baseDomain.includes('127.0.0.1') || baseDomain.includes('.pages.dev')) {
                        const storeUrl = `${protocol}//${baseDomain}/?tenant=${data.tenantId}`;
                        const adminUrl = `${protocol}//${baseDomain}/admin/?tenant=${data.tenantId}`;
                        (document.getElementById('store-url') as HTMLAnchorElement).href = storeUrl;
                        (document.getElementById('admin-url') as HTMLAnchorElement).href = adminUrl;
                    } else {
                        const storeUrl = `${protocol}//${data.tenantId}.${baseDomain}`;
                        const adminUrl = `${storeUrl}/admin`;
                        (document.getElementById('store-url') as HTMLAnchorElement).href = storeUrl;
                        (document.getElementById('admin-url') as HTMLAnchorElement).href = adminUrl;
                    }
                } else {
                    let errMsg = data.error || 'Error al procesar el registro.';
                    if (data.details) {
                        errMsg += ' ' + JSON.stringify(data.details);
                    }
                    throw new Error(errMsg);
                }
            } catch (error: any) {
                errorMsg.textContent = error.message;
                errorMsg.classList.remove('hidden');
            } finally {
                submitBtn.disabled = false;
                submitBtn.querySelector('.btn-text')?.classList.remove('hidden');
                submitBtn.querySelector('.spinner')?.classList.add('hidden');
            }
        });
    });