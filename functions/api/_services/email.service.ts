// functions/api/_services/email.service.ts
// Servicio de envío de correos transaccionales y plantillas de bienvenida (M-01)
import type { Env } from '../../types';

export interface WelcomeEmailData {
    to: string;
    tenantName: string;
    tenantSlug: string;
    template: string;
    storeUrl: string;
    adminUrl: string;
}

export interface EmailSendResult {
    success: boolean;
    messageId?: string;
    mocked?: boolean;
    error?: string;
}

/**
 * Mapeo legible de las plantillas de negocio
 */
function getTemplateFriendlyName(template: string): string {
    switch (template) {
        case 'restaurant':
            return 'Restaurante / Comida';
        case 'hardware':
            return 'Ferretería / Herramientas';
        case 'autoparts':
            return 'Repuestos Automotrices';
        case 'fashion':
            return 'Ropa / Moda';
        case 'tech':
            return 'Tecnología / Gadgets';
        default:
            return 'Comercio Digital';
    }
}

/**
 * Genera el cuerpo en texto plano para clientes de correo sin soporte HTML y prevención de spam
 */
export function generateWelcomeEmailText(data: WelcomeEmailData): string {
    const templateLabel = getTemplateFriendlyName(data.template);

    return `¡Felicitaciones! Tu tienda online "${data.tenantName}" ya está activa en Ventrina.

Detalles de tu cuenta:
- Nombre del negocio: ${data.tenantName}
- Plantilla inicial: ${templateLabel}
- Enlace público de tu tienda: ${data.storeUrl}
- Panel de control de administración: ${data.adminUrl}
- Usuario / Correo de acceso: ${data.to}

--------------------------------------------------
PRIMEROS PASOS PARA EMPEZAR A VENDER:
--------------------------------------------------

1. Revisa tu catálogo inicial
Hemos precargado varios productos de ejemplo según tu rubro (${templateLabel}). Entra a tu panel para editar sus nombres, precios, fotos o añadir nuevos platillos o productos.

2. Conecta tu WhatsApp para recibir pedidos
Tus clientes enviarán sus carritos de compra directo a tu número de WhatsApp. Verifica que tu número esté correcto en la pestaña de Configuración.

3. Configura tus pagos y tasa de cambio
Ajusta la tasa de cambio del BCV (o déjala automática) y configura los datos de tus cuentas bancarias, Pago Móvil o métodos en divisas.

4. Comparte el enlace de tu tienda
Coloca tu enlace directo (${data.storeUrl}) en tu biografía de Instagram, estados de WhatsApp, historias o códigos QR en tu local.

Accede a tu panel de administración aquí:
${data.adminUrl}

Si tienes preguntas o necesitas ayuda para configurar tu negocio, responde a este correo o escríbenos a nuestro equipo de soporte.

Atentamente,
El equipo de Ventrina SaaS
https://ventrina.app
`;
}

/**
 * Genera la plantilla de correo HTML moderna, responsive y libre de atributos de estilo inline
 */
export function generateWelcomeEmailHtml(data: WelcomeEmailData): string {
    const templateLabel = getTemplateFriendlyName(data.template);

    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>¡Bienvenido a Ventrina! Tu tienda está lista</title>
<style>
  body {
    margin: 0;
    padding: 0;
    background-color: #f1f5f9;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    color: #1e293b;
    -webkit-text-size-adjust: 100%;
  }
  .email-wrapper {
    width: 100%;
    background-color: #f1f5f9;
    padding: 32px 12px;
  }
  .email-container {
    max-width: 580px;
    margin: 0 auto;
    background-color: #ffffff;
    border-radius: 18px;
    border: 1px solid #e2e8f0;
    overflow: hidden;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.05);
  }
  .email-header {
    background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%);
    padding: 36px 32px 28px;
    text-align: center;
    color: #ffffff;
  }
  .brand-pill {
    display: inline-block;
    background: rgba(255, 255, 255, 0.18);
    border: 1px solid rgba(255, 255, 255, 0.3);
    padding: 4px 14px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    margin-bottom: 14px;
  }
  .email-header h1 {
    margin: 0 0 8px;
    font-size: 26px;
    font-weight: 800;
    letter-spacing: -0.02em;
    color: #ffffff;
  }
  .email-header p {
    margin: 0;
    font-size: 15px;
    color: rgba(255, 255, 255, 0.9);
    line-height: 1.5;
  }
  .email-body {
    padding: 32px 28px;
  }
  .summary-box {
    background-color: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 14px;
    padding: 20px;
    margin-bottom: 28px;
  }
  .summary-title {
    font-size: 13px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #64748b;
    margin: 0 0 12px;
  }
  .summary-row {
    margin-bottom: 10px;
    font-size: 14px;
    line-height: 1.5;
    color: #334155;
  }
  .summary-label {
    font-weight: 600;
    color: #0f172a;
  }
  .summary-link {
    color: #4f46e5;
    font-weight: 600;
    text-decoration: underline;
    word-break: break-all;
  }
  .cta-section {
    text-align: center;
    margin: 28px 0 34px;
  }
  .btn-primary-email {
    display: inline-block;
    background-color: #4f46e5;
    color: #ffffff;
    font-weight: 700;
    font-size: 15px;
    text-decoration: none;
    padding: 14px 32px;
    border-radius: 50px;
    letter-spacing: 0.02em;
    box-shadow: 0 4px 14px rgba(79, 70, 229, 0.35);
  }
  .section-heading {
    font-size: 18px;
    font-weight: 700;
    color: #0f172a;
    margin: 0 0 18px;
    border-bottom: 2px solid #f1f5f9;
    padding-bottom: 8px;
  }
  .step-list {
    margin: 0 0 28px;
    padding: 0;
    list-style: none;
  }
  .step-item {
    margin-bottom: 18px;
  }
  .step-badge {
    display: inline-block;
    width: 26px;
    height: 26px;
    line-height: 26px;
    text-align: center;
    background-color: #e0e7ff;
    color: #4338ca;
    font-weight: 700;
    font-size: 13px;
    border-radius: 50%;
    margin-right: 8px;
  }
  .step-title {
    font-size: 15px;
    font-weight: 700;
    color: #1e293b;
  }
  .step-desc {
    margin: 6px 0 0 34px;
    font-size: 14px;
    color: #64748b;
    line-height: 1.5;
  }
  .secondary-link-wrap {
    text-align: center;
    margin-top: 10px;
  }
  .secondary-link {
    color: #64748b;
    font-size: 14px;
    text-decoration: underline;
  }
  .email-footer {
    background-color: #f8fafc;
    border-top: 1px solid #e2e8f0;
    padding: 24px;
    text-align: center;
    font-size: 12px;
    color: #94a3b8;
    line-height: 1.6;
  }
  .footer-links {
    margin-bottom: 8px;
  }
  .footer-link {
    color: #64748b;
    text-decoration: none;
    margin: 0 6px;
  }
</style>
</head>
<body>
<div class="email-wrapper">
  <div class="email-container">
    <div class="email-header">
      <div class="brand-pill">Ventrina SaaS</div>
      <h1>¡Tu tienda está lista!</h1>
      <p>Felicitaciones por dar el paso hacia la digitalización de tu negocio.</p>
    </div>

    <div class="email-body">
      <div class="summary-box">
        <div class="summary-title">Detalles de tu nueva tienda</div>
        <div class="summary-row">
          <span class="summary-label">Nombre del negocio:</span> ${data.tenantName}
        </div>
        <div class="summary-row">
          <span class="summary-label">Plantilla activada:</span> ${templateLabel}
        </div>
        <div class="summary-row">
          <span class="summary-label">Enlace público:</span> 
          <a class="summary-link" href="${data.storeUrl}" target="_blank" rel="noopener">${data.storeUrl}</a>
        </div>
        <div class="summary-row">
          <span class="summary-label">Correo de administrador:</span> ${data.to}
        </div>
      </div>

      <div class="cta-section">
        <a class="btn-primary-email" href="${data.adminUrl}" target="_blank" rel="noopener">
          Acceder a mi Panel de Control
        </a>
        <div class="secondary-link-wrap">
          <a class="secondary-link" href="${data.storeUrl}" target="_blank" rel="noopener">
            Ver tienda en vivo (${data.tenantSlug}.ventrina.app)
          </a>
        </div>
      </div>

      <div class="section-heading">Primeros pasos recomendados</div>
      <ul class="step-list">
        <li class="step-item">
          <div><span class="step-badge">1</span><span class="step-title">Personaliza tus productos de ejemplo</span></div>
          <div class="step-desc">
            Ya hemos preparado productos demo para tu catálogo. Desde el panel puedes cambiar precios, nombres, imágenes y categorías en cuestión de segundos.
          </div>
        </li>
        <li class="step-item">
          <div><span class="step-badge">2</span><span class="step-title">Verifica tu número de WhatsApp</span></div>
          <div class="step-desc">
            Los clientes que ordenen enviarán sus pedidos directamente a tu WhatsApp. Asegúrate de que el número en Configuración sea el correcto.
          </div>
        </li>
        <li class="step-item">
          <div><span class="step-badge">3</span><span class="step-title">Configura métodos de pago y tasa BCV</span></div>
          <div class="step-desc">
            Activa la tasa oficial del Banco Central de Venezuela automática o manual, e indica tus coordenadas de Pago Móvil, Zelle o Binance.
          </div>
        </li>
        <li class="step-item">
          <div><span class="step-badge">4</span><span class="step-title">Comparte tu tienda en redes sociales</span></div>
          <div class="step-desc">
            Copia el enlace de tu tienda en el perfil de Instagram, compártelo en estados de WhatsApp o imprime tu código QR para exhibir en tu mostrador.
          </div>
        </li>
      </ul>
    </div>

    <div class="email-footer">
      <div class="footer-links">
        <a class="footer-link" href="https://ventrina.app">Ventrina</a> •
        <a class="footer-link" href="https://ventrina.app/terminos">Términos del Servicio</a> •
        <a class="footer-link" href="https://ventrina.app/precios">Planes</a>
      </div>
      <div>Este correo fue enviado automáticamente al crear una tienda en Ventrina.</div>
      <div>&copy; ${new Date().getFullYear()} Ventrina SaaS. Todos los derechos reservados.</div>
    </div>
  </div>
</div>
</body>
</html>`;
}

/**
 * Envía el correo electrónico de bienvenida mediante Resend o lo simula si no hay clave configurada
 */
export async function sendWelcomeEmail(
    env: Env,
    data: WelcomeEmailData
): Promise<EmailSendResult> {
    const subject = `¡Bienvenido a Ventrina! Tu tienda "${data.tenantName}" ya está lista 🚀`;
    const html = generateWelcomeEmailHtml(data);
    const text = generateWelcomeEmailText(data);
    const from = env.EMAIL_FROM || 'Ventrina <onboarding@ventrina.app>';

    // Modo simulación defensivo si no hay clave API configurada (desarrollo local / staging / tests)
    if (!env.RESEND_API_KEY) {
        console.log(`[EmailService] Clave RESEND_API_KEY no configurada. Simulando envío de bienvenida a: ${data.to}`);
        console.log(`[EmailService] Asunto: ${subject}`);
        console.log(`[EmailService] Enlace Tienda: ${data.storeUrl} | Admin: ${data.adminUrl}`);
        return {
            success: true,
            mocked: true,
            messageId: `simulated-${Date.now()}`
        };
    }

    try {
        const response = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${env.RESEND_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from,
                to: [data.to],
                subject,
                html,
                text
            })
        });

        if (!response.ok) {
            const errBody = await response.text();
            console.error(`[EmailService] Error al enviar email vía Resend (${response.status}):`, errBody);
            return {
                success: false,
                error: `Resend error ${response.status}: ${errBody}`
            };
        }

        const resData = (await response.json()) as { id?: string };
        console.log(`[EmailService] Email de bienvenida enviado con éxito a ${data.to}. MessageId: ${resData.id}`);
        return {
            success: true,
            messageId: resData.id
        };
    } catch (err: any) {
        console.error('[EmailService] Excepción de red al enviar correo de bienvenida:', err);
        return {
            success: false,
            error: err?.message || String(err)
        };
    }
}
