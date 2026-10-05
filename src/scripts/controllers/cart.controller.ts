import type { CartItem, OrderSubmissionData, StoreMetaConfig } from '../types/catalog.types';
import type { CartService } from '../services/cart.service';
import type { ICurrencyService } from '../services/bcv.service';
import type { IOrderService } from '../services/order.service';
import type { IToastService } from '../services/toast.service';
import type { IImageService } from '../services/image.service';
import { renderIconSvg } from '../../components/common/icons';

export class CartUIController {
    private cartService: CartService;
    private currencyService: ICurrencyService;
    private orderService: IOrderService;
    private toastService: IToastService;
    private imageService: IImageService;
    private config: StoreMetaConfig;

    private currentStep = 1;
    private uploadedReceiptBase64: string | null = null;
    private receiptFileInput: HTMLInputElement | null = null;

    constructor(
        cartService: CartService,
        currencyService: ICurrencyService,
        orderService: IOrderService,
        toastService: IToastService,
        imageService: IImageService,
        config: StoreMetaConfig
    ) {
        this.cartService = cartService;
        this.currencyService = currencyService;
        this.orderService = orderService;
        this.toastService = toastService;
        this.imageService = imageService;
        this.config = config;

        this.init();
    }

    private init(): void {
        this.bindEvents();
        this.cartService.subscribe(() => {
            this.render();
            this.updateBadge();
        });
        this.currencyService.onRateChange(() => {
            this.renderTotals();
        });

        // Exponer temporalmente para compatibilidad
        (window as any)._cart = {
            updateQty: (key: string, delta: number) => this.cartService.updateQuantity(key, delta),
            removeFromCart: (key: string) => this.cartService.removeItem(key),
        };
        (window as any).goToStep = (step: number) => this.goToStep(step);

        this.updateBadge();
    }

    public render(): void {
        this.renderItems();
        this.renderTotals();
    }

    private updateBadge(): void {
        const total = this.cartService.getTotalCount();
        const badge = document.getElementById('cart-count');
        const btn = document.getElementById('cart-btn');
        if (badge) badge.textContent = String(total);
        if (btn) btn.classList.toggle('visible', total > 0);
    }

    private renderItems(): void {
        const container = document.getElementById('cart-items');
        const totalFixed = document.getElementById('cart-total-fixed');
        const nextBtn = document.getElementById('cart-next-btn') as HTMLButtonElement | null;
        if (!container) return;

        const items = this.cartService.getItems();

        if (items.length === 0) {
            container.innerHTML = `<div class="empty-cart-msg">${this.config.emptyCartEmoji} Tu pedido está vacío</div>`;
            if (nextBtn) nextBtn.disabled = true;
            if (totalFixed) totalFixed.style.display = 'none';
            return;
        }

        if (nextBtn) nextBtn.disabled = false;
        if (totalFixed) totalFixed.style.display = 'flex';

        const labels: Record<string, string> = {
            switch: 'Switch',
            almacenamiento: 'Almacenamiento',
            capacidad: 'Capacidad',
            soporte: 'Montura',
            bateria: 'Batería',
            voltaje: 'Voltaje',
            longitud: 'Longitud',
            talla: 'Talla',
            color: 'Color',
            proteina: 'Proteína',
            guarnicion: 'Guarnición',
            relleno: 'Relleno',
            porcion: 'Porción',
            sabor: 'Sabor',
            presentacion: 'Presentación',
            punto: 'Punto',
            salsa: 'Salsa',
            cantidad: 'Cantidad',
            size: 'Opción',
            opcion: 'Opción',
        };

        container.innerHTML = items
            .map((item) => {
                const opts = Object.entries(item.options || {})
                    .filter(([, v]) => v)
                    .map(([k, v]) => {
                        const labelText = item.optionLabels?.[k] || labels[k] || (k.charAt(0).toUpperCase() + k.slice(1));
                        return `<span class="cart-item-option">${labelText}: ${v}</span>`;
                    })
                    .join('');

                const unitPrice =
                    item.price && item.price > 0 ? `$${item.price.toFixed(2)}` : 'A consultar';
                const subtotal =
                    item.price && item.price > 0
                        ? `$${(item.price * item.qty).toFixed(2)}`
                        : 'A consultar';

                return `
          <div class="cart-item">
            <div class="cart-item-info">
              <h4>${item.name}</h4>
              ${opts ? `<div class="cart-item-options">${opts}</div>` : ''}
            </div>
            <div class="cart-item-actions">
              <div class="cart-item-price">
                ${unitPrice}
                ${item.qty > 1 ? `<div class="cart-item-subtotal">(Subtotal: ${subtotal})</div>` : ''}
              </div>
              <div class="cart-item-controls-row">
                <div class="qty-control">
                  <button class="qty-btn" data-action="decrease" data-key="${item.key}">-</button>
                  <span class="qty-val">${item.qty}</span>
                  <button class="qty-btn" data-action="increase" data-key="${item.key}">+</button>
                </div>
                <button class="cart-item-remove" data-action="remove" data-key="${item.key}" title="Eliminar plato">
                  ${renderIconSvg('trash', { size: 16 })}
                </button>
              </div>
            </div>
          </div>
        `;
            })
            .join('');
    }

    private renderTotals(): void {
        const totalAmount = document.getElementById('cart-total-amount');
        const totalBsEl = document.getElementById('cart-total-bs');
        const pagoMovilBs = document.getElementById('pago-movil-bs-amount');
        if (!totalAmount) return;

        const deliveryType = this.getSelectedDeliveryType();
        const { subtotal, total } = this.cartService.calculateTotal(deliveryType);
        const bcvRate = this.currencyService.getRate();
        const totalBs = this.currencyService.toBs(total);

        if (subtotal === 0) {
            totalAmount.textContent = 'A consultar';
            if (totalBsEl) totalBsEl.textContent = '';
            if (pagoMovilBs) pagoMovilBs.textContent = 'Bs. 0,00';
            return;
        }

        const isDelivery = deliveryType === 'delivery';
        totalAmount.innerHTML = isDelivery
            ? `$${total.toFixed(2)} <span class="cart-delivery-note">(Incl. $${this.config.deliveryPrice} ${this.config.deliveryName})</span>`
            : `$${total.toFixed(2)}`;

        if (totalBsEl) {
            totalBsEl.innerHTML = `≈ Bs. ${totalBs.toFixed(2)} <span class="cart-bcv-note">(BCV: ${bcvRate.toFixed(2)})</span>`;
        }
        if (pagoMovilBs) {
            pagoMovilBs.textContent = `Bs. ${totalBs.toFixed(2)}`;
        }
    }

    private getSelectedDeliveryType(): 'retiro' | 'delivery' {
        const input = document.querySelector(
            'input[name="delivery-type"]:checked'
        ) as HTMLInputElement | null;
        return (input?.value as 'retiro' | 'delivery') || 'retiro';
    }

    public toggleCart(): void {
        const drawer = document.getElementById('cart-drawer');
        const overlay = document.getElementById('cart-overlay');
        drawer?.classList.toggle('active');
        overlay?.classList.toggle('active');

        if (drawer?.classList.contains('active')) {
            this.render();
            this.updateStepUI();
        } else {
            setTimeout(() => {
                this.currentStep = 1;
                this.updateStepUI();
            }, 350);
        }
    }

    public goToStep(step: number): void {
        if (step === 2) {
            if (this.cartService.getItems().length === 0) {
                return this.toastService.show('⚠️ Tu pedido está vacío');
            }
        }

        if (step === 3) {
            const nameInput = document.getElementById('client-name') as HTMLInputElement | null;
            const phoneInput = document.getElementById('client-phone') as HTMLInputElement | null;
            const deliveryType = this.getSelectedDeliveryType();
            const addressInput = document.getElementById('delivery-address') as HTMLInputElement | null;

            if (!nameInput?.value.trim() || !phoneInput?.value.trim()) {
                this.toastService.show('⚠️ Ingresa tu nombre y teléfono.');
                if (!nameInput?.value.trim()) nameInput?.focus();
                else phoneInput?.focus();
                return;
            }

            if (deliveryType === 'delivery' && !addressInput?.value.trim()) {
                this.toastService.show('⚠️ Ingresa la dirección para el delivery.');
                addressInput?.focus();
                return;
            }
        }

        this.currentStep = step;
        this.updateStepUI();
    }

    private updateStepUI(): void {
        const s1 = document.getElementById('cart-step-1');
        const s2 = document.getElementById('cart-step-2');
        const s3 = document.getElementById('cart-step-3');
        if (s1) s1.style.display = this.currentStep === 1 ? 'flex' : 'none';
        if (s2) s2.style.display = this.currentStep === 2 ? 'flex' : 'none';
        if (s3) s3.style.display = this.currentStep === 3 ? 'flex' : 'none';

        const title = document.getElementById('cart-title');
        const backBtn = document.getElementById('cart-back-btn');
        const nextBtn = document.getElementById('cart-next-btn');
        const waBtn = document.getElementById('whatsapp-order-btn');

        if (this.currentStep === 1) {
            if (title) title.innerHTML = '🛒 Tu Pedido';
            if (backBtn) backBtn.style.display = 'none';
            if (nextBtn) {
                nextBtn.style.display = 'flex';
                nextBtn.innerHTML = `Continuar (Datos) ${renderIconSvg('chevron-right', { size: 18 })}`;
            }
            if (waBtn) waBtn.style.display = 'none';
        } else if (this.currentStep === 2) {
            if (title) title.innerHTML = '📦 Entrega';
            if (backBtn) backBtn.style.display = 'flex';
            if (nextBtn) {
                nextBtn.style.display = 'flex';
                nextBtn.innerHTML = `Continuar al Pago ${renderIconSvg('chevron-right', { size: 18 })}`;
            }
            if (waBtn) waBtn.style.display = 'none';
        } else if (this.currentStep === 3) {
            if (title) title.innerHTML = '💳 Pago';
            if (backBtn) backBtn.style.display = 'flex';
            if (nextBtn) nextBtn.style.display = 'none';
            if (waBtn) waBtn.style.display = 'flex';
        }
    }

    private bindEvents(): void {
        // Toggle cart drawer
        document.getElementById('cart-btn')?.addEventListener('click', () => this.toggleCart());
        document.getElementById('close-cart')?.addEventListener('click', () => this.toggleCart());
        document.getElementById('cart-overlay')?.addEventListener('click', () => this.toggleCart());

        // Step navigation
        document.getElementById('cart-back-btn')?.addEventListener('click', () => {
            if (this.currentStep > 1) this.goToStep(this.currentStep - 1);
        });
        document.getElementById('cart-next-btn')?.addEventListener('click', () => {
            if (this.currentStep < 3) this.goToStep(this.currentStep + 1);
        });

        // Cart items event delegation (Single handler for quantity & remove)
        document.getElementById('cart-items')?.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            const btn = target.closest('[data-action]') as HTMLElement | null;
            if (!btn) return;

            const action = btn.getAttribute('data-action');
            const key = btn.getAttribute('data-key');
            if (!key) return;

            if (action === 'increase') {
                this.cartService.updateQuantity(key, 1);
            } else if (action === 'decrease') {
                this.cartService.updateQuantity(key, -1);
            } else if (action === 'remove') {
                this.cartService.removeItem(key);
            }
        });

        // Clear cart modal
        const confirmModal = document.getElementById('confirm-modal');
        document.getElementById('clear-cart')?.addEventListener('click', () => {
            if (this.cartService.getItems().length > 0) confirmModal?.classList.add('active');
        });
        document.getElementById('modal-cancel')?.addEventListener('click', () => {
            confirmModal?.classList.remove('active');
        });
        confirmModal?.addEventListener('click', (e) => {
            if (e.target === confirmModal) confirmModal.classList.remove('active');
        });
        document.getElementById('modal-confirm')?.addEventListener('click', () => {
            this.cartService.clear();
            confirmModal?.classList.remove('active');
            this.toastService.show('Pedido vaciado');
        });

        // Delivery type selection
        const addressContainer = document.getElementById('delivery-address-container');
        document.querySelectorAll('input[name="delivery-type"]').forEach((radio) => {
            radio.addEventListener('change', (e) => {
                const isDelivery = (e.target as HTMLInputElement).value === 'delivery';
                if (addressContainer) {
                    addressContainer.style.display = isDelivery ? 'block' : 'none';
                }

                const paymentSelect = document.getElementById('payment-method') as HTMLSelectElement | null;
                if (paymentSelect && isDelivery && paymentSelect.value === 'punto') {
                    paymentSelect.value = '';
                }
                const puntoOption = paymentSelect?.querySelector('option[value="punto"]') as HTMLOptionElement | null;
                if (puntoOption) {
                    puntoOption.disabled = isDelivery;
                }

                this.renderTotals();
            });
        });

        // Payment method selection
        document.getElementById('payment-method')?.addEventListener('change', (e) => {
            const method = (e.target as HTMLSelectElement).value;
            const refContainer = document.getElementById('payment-reference-container');
            const infoPagoMovil = document.getElementById('payment-info-pago-movil');
            const infoZelle = document.getElementById('payment-info-zelle');

            if (infoPagoMovil) infoPagoMovil.style.display = method === 'pago_movil' ? 'block' : 'none';
            if (infoZelle) infoZelle.style.display = method === 'zelle' ? 'block' : 'none';
            if (refContainer) {
                refContainer.style.display = method === 'pago_movil' || method === 'zelle' ? 'block' : 'none';
            }
        });

        // Copy Pago Movil Data
        document.getElementById('copy-pm-btn')?.addEventListener('click', async (e) => {
            const banco = document.getElementById('pm-data-banco')?.textContent?.trim() || '';
            const telefono = document.getElementById('pm-data-telefono')?.textContent?.trim() || '';
            const cedula = document.getElementById('pm-data-cedula')?.textContent?.trim() || '';
            const copyText = `Banco: ${banco}\nTeléfono: ${telefono}\nC.I/RIF: ${cedula}`;
            
            try {
                await navigator.clipboard.writeText(copyText);
                const btn = e.currentTarget as HTMLButtonElement;
                const originalHtml = btn.innerHTML;
                btn.innerHTML = '✅ ¡Copiado!';
                this.toastService.show('Datos copiados al portapapeles');
                setTimeout(() => { btn.innerHTML = originalHtml; }, 2000);
            } catch (err) {
                this.toastService.show('❌ Error al copiar los datos');
            }
        });

        // Copy Zelle Data
        document.getElementById('copy-zelle-btn')?.addEventListener('click', async (e) => {
            const email = document.getElementById('zelle-data-email')?.textContent?.trim() || '';
            const titular = document.getElementById('zelle-data-titular')?.textContent?.trim() || '';
            const copyText = `Correo: ${email}\nTitular: ${titular}`;
            
            try {
                await navigator.clipboard.writeText(copyText);
                const btn = e.currentTarget as HTMLButtonElement;
                const originalHtml = btn.innerHTML;
                btn.innerHTML = '✅ ¡Copiado!';
                this.toastService.show('Datos copiados al portapapeles');
                setTimeout(() => { btn.innerHTML = originalHtml; }, 2000);
            } catch (err) {
                this.toastService.show('❌ Error al copiar los datos');
            }
        });

        // Receipt dropzone & file handling
        this.bindReceiptUpload();

        // Submit order via WhatsApp
        document.getElementById('whatsapp-order-btn')?.addEventListener('click', () => this.handleOrderSubmit());
    }

    private bindReceiptUpload(): void {
        const dropzone = document.getElementById('receipt-dropzone');
        this.receiptFileInput = document.getElementById('payment-receipt-file') as HTMLInputElement | null;

        dropzone?.addEventListener('click', (e) => {
            if ((e.target as HTMLElement).id === 'btn-remove-receipt') return;
            this.receiptFileInput?.click();
        });

        this.receiptFileInput?.addEventListener('change', async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;

            try {
                this.toastService.show('📷 Procesando comprobante...');
                this.uploadedReceiptBase64 = await this.imageService.compress(file);

                const previewBox = document.getElementById('receipt-preview-box');
                const promptBox = document.getElementById('receipt-prompt');
                const previewImg = document.getElementById('receipt-preview-img') as HTMLImageElement | null;
                const previewName = document.getElementById('receipt-preview-name');

                if (previewImg) previewImg.src = this.uploadedReceiptBase64;
                if (previewName) previewName.textContent = file.name;
                if (promptBox) promptBox.style.display = 'none';
                if (previewBox) previewBox.style.display = 'flex';
                this.toastService.show('✅ Comprobante adjuntado correctamente');
            } catch {
                this.toastService.show('❌ No se pudo procesar la imagen del comprobante.');
            }
        });

        document.getElementById('btn-remove-receipt')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.uploadedReceiptBase64 = null;
            if (this.receiptFileInput) this.receiptFileInput.value = '';
            const previewBox = document.getElementById('receipt-preview-box');
            const promptBox = document.getElementById('receipt-prompt');
            if (promptBox) promptBox.style.display = 'block';
            if (previewBox) previewBox.style.display = 'none';
            this.toastService.show('Comprobante removido');
        });
    }

    private async handleOrderSubmit(): Promise<void> {
        const nameInput = document.getElementById('client-name') as HTMLInputElement | null;
        const phoneInput = document.getElementById('client-phone') as HTMLInputElement | null;
        const addressInput = document.getElementById('delivery-address') as HTMLInputElement | null;
        const paymentSelect = document.getElementById('payment-method') as HTMLSelectElement | null;
        const paymentRefInput = document.getElementById('payment-reference') as HTMLInputElement | null;

        const clientName = nameInput?.value.trim() || '';
        const clientPhone = phoneInput?.value.trim() || '';
        const deliveryType = this.getSelectedDeliveryType();
        const deliveryAddress = addressInput?.value.trim() || '';
        const paymentMethod = paymentSelect?.value || '';
        const paymentReference = paymentRefInput?.value.trim() || '';

        if (!paymentMethod) {
            this.toastService.show('⚠️ Selecciona un método de pago.');
            paymentSelect?.focus();
            return;
        }

        if ((paymentMethod === 'pago_movil' || paymentMethod === 'zelle') && !paymentReference) {
            this.toastService.show('⚠️ Ingresa el número de referencia del pago.');
            paymentRefInput?.focus();
            return;
        }

        const waBtn = document.getElementById('whatsapp-order-btn') as HTMLButtonElement | null;
        if (waBtn) {
            waBtn.disabled = true;
            waBtn.innerHTML = 'Registrando Pedido...';
        }

        const submissionData: OrderSubmissionData = {
            clientName,
            clientPhone,
            deliveryType,
            deliveryAddress,
            paymentMethod,
            paymentReference,
            paymentReceipt: this.uploadedReceiptBase64,
        };

        const items = this.cartService.getItems();

        try {
            const { orderId } = await this.orderService.submitOrder(submissionData, items);
            const waUrl = this.orderService.buildWhatsAppUrl(orderId, submissionData, items);

            // Limpieza del carrito y formulario
            this.cartService.clear();
            if (nameInput) nameInput.value = '';
            if (phoneInput) phoneInput.value = '';
            if (paymentSelect) paymentSelect.value = '';
            if (paymentRefInput) paymentRefInput.value = '';
            this.uploadedReceiptBase64 = null;
            if (this.receiptFileInput) this.receiptFileInput.value = '';

            const previewBox = document.getElementById('receipt-preview-box');
            const promptBox = document.getElementById('receipt-prompt');
            if (promptBox) promptBox.style.display = 'block';
            if (previewBox) previewBox.style.display = 'none';

            const refContainer = document.getElementById('payment-reference-container');
            const infoPagoMovil = document.getElementById('payment-info-pago-movil');
            const infoZelle = document.getElementById('payment-info-zelle');
            if (refContainer) refContainer.style.display = 'none';
            if (infoPagoMovil) infoPagoMovil.style.display = 'none';
            if (infoZelle) infoZelle.style.display = 'none';

            this.toggleCart();
            this.toastService.show(`🎉 ¡Pedido #${orderId} registrado con éxito!`);

            const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
            if (isMobile) {
                window.location.href = waUrl;
            } else {
                window.open(waUrl, '_blank');
            }
        } catch (err: any) {
            this.toastService.show(`❌ ${err.message || 'Error al registrar pedido. Intenta de nuevo.'}`);
        } finally {
            if (waBtn) {
                waBtn.disabled = false;
                waBtn.innerHTML = 'Enviar Pedido por WhatsApp';
            }
        }
    }
}
