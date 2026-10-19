// functions/api/openapi.ts
// Especificación OpenAPI 3.0.3 para la API de Vendly SaaS (U-03)
import { jsonResponse } from "./_helpers";
import type { Env, PagesHandler } from '../types';

export const openApiSpec = {
    openapi: "3.0.3",
    info: {
        title: "Vendly SaaS API",
        version: "2.0.0",
        description: "API Multi-Tenant para catálogo, pedidos, inventario, analíticas y gestión de tiendas Vendly SaaS.",
        contact: {
            name: "Equipo de Ingeniería Vendly",
            url: "https://vendly.app"
        }
    },
    servers: [
        { url: "/api", description: "Servidor Principal de API" },
        { url: "/api/v1", description: "API Versión 1" }
    ],
    paths: {
        "/health": {
            get: {
                summary: "Verificación de salud y latencia de base de datos",
                tags: ["Sistema"],
                responses: {
                    "200": { description: "Servidor y base de datos saludables" },
                    "503": { description: "Servicio degradado" }
                }
            }
        },
        "/auth": {
            post: {
                summary: "Iniciar sesión administrativa",
                tags: ["Autenticación"],
                requestBody: {
                    required: true,
                    content: {
                        "application/json": {
                            schema: {
                                type: "object",
                                required: ["username", "password"],
                                properties: {
                                    username: { type: "string" },
                                    password: { type: "string" },
                                    tenant: { type: "string" }
                                }
                            }
                        }
                    }
                },
                responses: {
                    "200": { description: "Autenticación exitosa y cookie Set-Cookie" },
                    "401": { description: "Credenciales inválidas" },
                    "429": { description: "Límite de intentos excedido" }
                }
            },
            put: {
                summary: "Cambiar contraseña de usuario actual",
                tags: ["Autenticación"],
                responses: {
                    "200": { description: "Contraseña actualizada exitosamente" },
                    "400": { description: "Contraseña actual incorrecta o nueva no cumple políticas" },
                    "401": { description: "No autorizado" }
                }
            },
            delete: {
                summary: "Cerrar sesión (Logout)",
                tags: ["Autenticación"],
                responses: {
                    "200": { description: "Sesión cerrada y cookie eliminada" }
                }
            }
        },
        "/products": {
            get: {
                summary: "Listar productos o buscar por query",
                tags: ["Productos"],
                parameters: [
                    { name: "id", in: "query", schema: { type: "string" }, description: "ID único del producto" },
                    { name: "q", in: "query", schema: { type: "string" }, description: "Término de búsqueda full-text" },
                    { name: "template", in: "query", schema: { type: "string" } },
                    { name: "admin", in: "query", schema: { type: "boolean" } },
                    { name: "page", in: "query", schema: { type: "integer" } },
                    { name: "limit", in: "query", schema: { type: "integer" } }
                ],
                responses: {
                    "200": { description: "Lista de productos paginada o producto individual" }
                }
            },
            post: {
                summary: "Crear un nuevo producto (Admin only)",
                tags: ["Productos"],
                responses: {
                    "201": { description: "Producto creado con éxito" },
                    "400": { description: "Datos inválidos" },
                    "403": { description: "Límite del plan alcanzado" }
                }
            },
            put: {
                summary: "Actualizar producto existente (Admin only)",
                tags: ["Productos"],
                responses: {
                    "200": { description: "Producto actualizado" },
                    "404": { description: "Producto no encontrado" }
                }
            },
            delete: {
                summary: "Eliminar o archivar producto (Admin only)",
                tags: ["Productos"],
                parameters: [
                    { name: "id", in: "query", schema: { type: "string" } },
                    { name: "ids", in: "query", schema: { type: "string" } },
                    { name: "permanent", in: "query", schema: { type: "boolean" } }
                ],
                responses: {
                    "200": { description: "Producto archivado o eliminado" }
                }
            },
            patch: {
                summary: "Archivar o restaurar producto",
                tags: ["Productos"],
                parameters: [
                    { name: "id", in: "query", required: true, schema: { type: "string" } },
                    { name: "action", in: "query", schema: { type: "string", enum: ["archive", "restore"] } }
                ],
                responses: {
                    "200": { description: "Estado de producto actualizado" }
                }
            }
        },
        "/orders": {
            get: {
                summary: "Listar pedidos paginados (Admin / Staff) o consultar pedido individual",
                tags: ["Pedidos"],
                parameters: [
                    { name: "id", in: "query", schema: { type: "string" }, description: "ID de pedido" },
                    { name: "after", in: "query", schema: { type: "string" }, description: "Cursor ID para paginación eficiente" },
                    { name: "status", in: "query", schema: { type: "string" } },
                    { name: "limit", in: "query", schema: { type: "integer" } }
                ],
                responses: {
                    "200": { description: "Lista de pedidos con metadata cursor o pedido con items y eventos" }
                }
            },
            post: {
                summary: "Crear nuevo pedido desde storefront (Checkout)",
                tags: ["Pedidos"],
                responses: {
                    "200": { description: "Pedido creado exitosamente con número de orden" },
                    "400": { description: "Validación o CAPTCHA fallido" },
                    "409": { description: "Conflicto por stock agotado" }
                }
            },
            put: {
                summary: "Actualizar estado de pedido y registrar evento (Admin / Staff)",
                tags: ["Pedidos"],
                responses: {
                    "200": { description: "Estado actualizado y enlace de WhatsApp generado" }
                }
            }
        },
        "/categories": {
            get: {
                summary: "Obtener categorías del catálogo",
                tags: ["Categorías"],
                responses: {
                    "200": { description: "Lista de categorías con conteo de productos" }
                }
            },
            post: {
                summary: "Crear categoría (Admin only)",
                tags: ["Categorías"],
                responses: {
                    "201": { description: "Categoría creada" }
                }
            }
        },
        "/users": {
            get: {
                summary: "Listar usuarios del tenant (Admin only)",
                tags: ["Usuarios"],
                responses: {
                    "200": { description: "Lista de usuarios y sus roles" }
                }
            },
            post: {
                summary: "Crear nuevo usuario con rol admin o staff (Admin only)",
                tags: ["Usuarios"],
                responses: {
                    "201": { description: "Usuario creado exitosamente" },
                    "409": { description: "Nombre de usuario ya existente" }
                }
            },
            delete: {
                summary: "Eliminar usuario del tenant (Admin only)",
                tags: ["Usuarios"],
                parameters: [
                    { name: "id", in: "query", schema: { type: "integer" } },
                    { name: "username", in: "query", schema: { type: "string" } }
                ],
                responses: {
                    "200": { description: "Usuario eliminado" }
                }
            }
        },
        "/upload": {
            post: {
                summary: "Subir imagen a almacenamiento R2",
                tags: ["Multimedia"],
                parameters: [
                    { name: "type", in: "query", schema: { type: "string", enum: ["product", "receipt"] } }
                ],
                responses: {
                    "200": { description: "URL pública del archivo subido" },
                    "429": { description: "Límite de subida de comprobantes alcanzado" }
                }
            }
        },
        "/analytics": {
            get: {
                summary: "Consultar métricas analíticas consolidadas de la tienda",
                tags: ["Analíticas"],
                parameters: [
                    { name: "from", in: "query", schema: { type: "string", format: "date" } },
                    { name: "to", in: "query", schema: { type: "string", format: "date" } },
                    { name: "limit", in: "query", schema: { type: "integer" } }
                ],
                responses: {
                    "200": { description: "Métricas de ventas, productos más vendidos y desglose" }
                }
            }
        }
    }
};

export const onRequestGet: PagesHandler<Env> = async () => {
    return jsonResponse(openApiSpec, 200, {
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
        "Access-Control-Allow-Origin": "*"
    });
};
