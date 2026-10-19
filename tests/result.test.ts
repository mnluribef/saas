// tests/result.test.ts
// Tests unitarios para el tipo y utilidades Result<T, E> (M-03)
import { describe, it, expect } from 'vitest';
import { ok, err, isOk, isErr, unwrap, unwrapOr, mapOk, type Result } from '../functions/api/_result';

describe('M-03: Result<T, E> Pattern (_result.ts)', () => {
    it('creates an Ok result with data', () => {
        const res = ok({ id: 'ord-123', total: 50.0 });
        expect(res.ok).toBe(true);
        expect(res.data.id).toBe('ord-123');
        expect(isOk(res)).toBe(true);
        expect(isErr(res)).toBe(false);
    });

    it('creates an Err result with error message and optional code', () => {
        const res = err('Coupon expired', 400);
        expect(res.ok).toBe(false);
        expect(res.error).toBe('Coupon expired');
        expect(res.code).toBe(400);
        expect(isOk(res)).toBe(false);
        expect(isErr(res)).toBe(true);
    });

    it('unwraps data when Ok and throws when Err', () => {
        const success = ok('hello');
        expect(unwrap(success)).toBe('hello');

        const failure = err('Something failed');
        expect(() => unwrap(failure)).toThrow(/Called unwrap on Err: Something failed/);
    });

    it('unwraps with fallback using unwrapOr', () => {
        const success = ok(42);
        expect(unwrapOr(success, 0)).toBe(42);

        const failure: Result<number, string> = err('failed');
        expect(unwrapOr(failure, 0)).toBe(0);
    });

    it('maps value when Ok using mapOk', () => {
        const success = ok(10);
        const mappedSuccess = mapOk(success, (n: number) => n * 2);
        expect(isOk(mappedSuccess)).toBe(true);
        if (isOk(mappedSuccess)) {
            expect(mappedSuccess.data).toBe(20);
        }

        const failure: Result<number, string> = err('error');
        const mappedFailure = mapOk(failure, (n: number) => n * 2);
        expect(isErr(mappedFailure)).toBe(true);
        if (isErr(mappedFailure)) {
            expect(mappedFailure.error).toBe('error');
        }
    });
});
