# Vendly SaaS

Plataforma SaaS multi-plantilla para creación de catálogos virtuales, control de ventas y pedidos directos a WhatsApp, construida para ser rápida y desplegada globalmente en el borde.

Live Demo: https://vendly-20w.pages.dev

## 🛠️ Stack Tecnológico

- **Frontend:** Astro + Vanilla CSS / TailwindCSS
- **Backend / API:** Cloudflare Pages Functions
- **Base de Datos:** Cloudflare D1 (SQLite en el borde)
- **Almacenamiento:** Cloudflare R2 (para comprobantes e imágenes)
- **Gestor de Paquetes:** `pnpm`

---

## 🚀 Guía de Inicio y Ejecución Local

Sigue estos pasos para levantar el entorno de desarrollo local, el cual incluye un emulador para la base de datos D1 gracias a Wrangler.

### 1. Requisitos Previos
Asegúrate de tener instalado en tu sistema:
- [Node.js](https://nodejs.org/es/) (v18 o superior)
- [pnpm](https://pnpm.io/es/installation)
- (Opcional pero recomendado) Wrangler CLI instalado globalmente: `npm install -g wrangler`

### 2. Instalación de Dependencias
Clona el repositorio e instala las dependencias usando `pnpm`:

```bash
pnpm install
```

### 3. Configuración de la Base de Datos (D1 Local)
Para que el sistema funcione en local, debes crear las tablas, aplicar las migraciones y opcionalmente introducir los datos semilla (menú y configuraciones iniciales). Ejecuta los siguientes comandos en orden:

```bash
# 1. Crear el esquema principal de tablas
pnpm run db:init:local

# 2. Aplicar las migraciones (Multi-tenant y Rate limits)
pnpm run db:migrate:local

# 3. (Opcional) Cargar productos de ejemplo de plantillas base
pnpm run db:seed:local
```

### 4. Crear un Usuario Administrador
Por razones de seguridad, no existen usuarios por defecto. Debes crear el primer super-admin del SaaS usando el script integrado:

```bash
pnpm run create-admin tunombre tucontraseñasegura
```
*Sustituye `tunombre` y `tucontraseñasegura` por tus propios datos.*

### 5. Iniciar el Servidor de Desarrollo
Para que las API Functions y la base de datos local funcionen junto con Astro, debes ejecutar el script `dev:pages`. Este script usa `concurrently` para levantar Astro y conectarlo con el emulador de Cloudflare Wrangler:

```bash
pnpm run dev:pages
```

**⚠️ Importante:** La terminal te mostrará dos puertos (usualmente `4321` para Astro y `8788` para Wrangler). **Siempre debes usar la URL de Wrangler (por ejemplo, `http://localhost:8788`)** en tu navegador para que los endpoints de la API (`/api/...`) funcionen correctamente con la base de datos local.

---

## 📦 Despliegue a Producción

Para compilar y enviar la aplicación a la red global de Cloudflare Pages:

```bash
pnpm run deploy
```

Si necesitas aplicar migraciones de base de datos directamente en el entorno de producción, utiliza:

```bash
pnpm run db:migrate:remote
```

## ⚙️ Variables de Entorno (Locales)

Si necesitas probar subida de archivos (R2), integración con webhooks o requerir el CAPTCHA (Turnstile), crea un archivo `.dev.vars` en la raíz del proyecto. **Este archivo está ignorado en Git**.

Ejemplo de `.dev.vars`:
```env
# Clave super-admin para APIs internas
SUPERADMIN_KEY=tu-clave-secreta

# Para Turnstile (opcional)
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA

# Webhook para notificaciones (opcional)
WEBHOOK_URL=https://tu-webhook.com/endpoint
```
