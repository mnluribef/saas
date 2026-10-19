// functions/api/_result.ts
// M-03: Tipo discriminado Result<T, E> para manejo predecible y tipado de respuestas de servicio

export type Ok<T> = { readonly ok: true; readonly data: T };
export type Err<E = string> = { readonly ok: false; readonly error: E; readonly code?: number };
export type Result<T, E = string> = Ok<T> | Err<E>;

/**
 * Crea un resultado exitoso (Ok) conteniendo los datos producidos.
 */
export const ok = <T>(data: T): Ok<T> => ({ ok: true, data });

/**
 * Crea un resultado de error (Err) conteniendo el mensaje o estructura del error y un código opcional.
 */
export const err = <E>(error: E, code?: number): Err<E> => ({ ok: false, error, code });

/**
 * Type guard para verificar si un Result es Ok.
 */
export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
    return result.ok === true;
}

/**
 * Type guard para verificar si un Result es Err.
 */
export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
    return result.ok === false;
}

/**
 * Extrae el valor de un Result Ok o lanza una excepción si es Err.
 */
export function unwrap<T, E>(result: Result<T, E>): T {
    if (result.ok) {
        return result.data;
    }
    throw new Error(`Called unwrap on Err: ${typeof result.error === 'object' ? JSON.stringify(result.error) : String(result.error)}`);
}

/**
 * Extrae el valor de un Result Ok o retorna el valor fallback proporcionado.
 */
export function unwrapOr<T, E>(result: Result<T, E>, fallback: T): T {
    return result.ok ? result.data : fallback;
}

/**
 * Transforma el valor de un Ok aplicando una función de mapeo fn. Si es Err, lo preserva.
 */
export function mapOk<T, U, E>(result: Result<T, E>, fn: (val: T) => U): Result<U, E> {
    if (result.ok) {
        return ok(fn(result.data));
    }
    return result;
}
