import { describe, it, expect } from 'vitest';
import {
    hashPasswordPBKDF2,
    hashSHA256,
    generateSalt,
    hexToBytes,
    bytesToHex
} from '../functions/api/_auth';

describe('Authentication & Crypto Logic (_auth.ts)', () => {
    it('converts bytes to hex and back accurately', () => {
        const originalBytes = new Uint8Array([0, 15, 255, 128, 42]);
        const hex = bytesToHex(originalBytes);
        expect(hex).toBe('000fff802a');

        const recoveredBytes = hexToBytes(hex);
        expect(recoveredBytes).toEqual(originalBytes);
    });

    it('generates random salts of 16 bytes (32 hex chars)', () => {
        const salt1 = generateSalt();
        const salt2 = generateSalt();
        expect(salt1.length).toBe(32);
        expect(salt2.length).toBe(32);
        expect(salt1).not.toBe(salt2);
    });

    it('hashes passwords directly with PBKDF2 (Fix #5)', async () => {
        const salt = generateSalt();
        const password = 'mySecurePassword123!';
        
        const hash1 = await hashPasswordPBKDF2(password, salt);
        const hash2 = await hashPasswordPBKDF2(password, salt);
        
        expect(hash1).toBe(hash2);
        expect(hash1.length).toBe(64); // 256 bits = 32 bytes = 64 hex chars
    });

    it('demonstrates distinct hash outputs between direct PBKDF2 and legacy pre-hashed SHA256', async () => {
        const salt = generateSalt();
        const password = 'mySecurePassword123!';
        
        const directHash = await hashPasswordPBKDF2(password, salt);
        const preSha = await hashSHA256(password);
        const legacyHash = await hashPasswordPBKDF2(preSha, salt);
        
        expect(directHash).not.toBe(legacyHash);
    });
});
