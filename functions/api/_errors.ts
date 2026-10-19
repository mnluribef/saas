// functions/api/_errors.ts
// Estandarización de errores y códigos legibles para toda la API de Ventrina SaaS (U-04)

export const ErrorTypes = {
    UNAUTHORIZED: 'https://ventrina.app/errors/unauthorized',
    FORBIDDEN: 'https://ventrina.app/errors/forbidden',
    NOT_FOUND: 'https://ventrina.app/errors/not-found',
    VALIDATION_ERROR: 'https://ventrina.app/errors/validation-error',
    RATE_LIMIT_EXCEEDED: 'https://ventrina.app/errors/rate-limit-exceeded',
    CSRF_FAILED: 'https://ventrina.app/errors/csrf-failed',
    INTERNAL_ERROR: 'https://ventrina.app/errors/internal-error',
    STOCK_DEPLETED: 'https://ventrina.app/errors/stock-depleted',
    ORDER_LIMIT_REACHED: 'https://ventrina.app/errors/order-limit-reached',
} as const;

export const ErrorMessages = {
    UNAUTHORIZED: 'No autorizado. La sesión es inválida, ha expirado o no fue suministrada.',
    FORBIDDEN: 'Acceso prohibido. No posee los permisos requeridos para realizar esta acción.',
    CSRF_FAILED: 'Verificación de seguridad CSRF fallida. Origen o cabecera no autorizada.',
    RATE_LIMIT_EXCEEDED: 'Ha superado el límite de intentos permitidos. Por favor espere antes de reintentar.',
    INTERNAL_ERROR: 'Se produjo un error interno en el servidor. Intente nuevamente más tarde.',
    TENANT_NOT_FOUND: 'La tienda indicada no fue encontrada o se encuentra inactiva.',
    RESOURCE_NOT_FOUND: 'El recurso solicitado no existe.',
    INVALID_PAYLOAD: 'Los datos suministrados en la solicitud no son válidos.',
    STOCK_DEPLETED: 'El inventario disponible no es suficiente para completar la orden solicitada.',
} as const;
