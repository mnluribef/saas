#!/usr/bin/env node
// scripts/generate-admin.js
// Generador de credenciales administrativas para Vendly SaaS

import crypto from 'node:crypto';

// Helpers de conversión
function hexToBytes(hex) {
  return new Uint8Array(Buffer.from(hex, 'hex'));
}

async function hashClientSHA256(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

async function hashPBKDF2(clientHash, saltHex) {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(clientHash, hexToBytes(saltHex), 100000, 32, 'sha256', (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey.toString('hex'));
    });
  });
}

function generateSecurePassword(length = 16) {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*';
  let pwd = '';
  const randomBytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    pwd += chars[randomBytes[i] % chars.length];
  }
  return pwd;
}

async function main() {
  const args = process.argv.slice(2);
  const username = args[0] || 'admin_vendly';
  const password = args[1] || generateSecurePassword(14);

  // 1. Simular hash del cliente (SHA-256)
  const clientHash = await hashClientSHA256(password);

  // 2. Generar salt aleatorio (128 bits / 16 bytes)
  const saltHex = crypto.randomBytes(16).toString('hex');

  // 3. Generar hash PBKDF2 (100,000 iteraciones con SHA-256)
  const pbkdf2Hash = await hashPBKDF2(clientHash, saltHex);

  const sqlInsert = `INSERT OR REPLACE INTO users (id, username, password_hash, password_salt) VALUES (1, '${username}', '${pbkdf2Hash}', '${saltHex}');`;

  console.log('\n======================================================');
  console.log('       🛡️  VENDLY SAAS — CREDENCIALES ADMIN');
  console.log('======================================================\n');
  console.log(`👤 Usuario:    \x1b[32m${username}\x1b[0m`);
  console.log(`🔑 Contraseña: \x1b[33m${password}\x1b[0m`);
  console.log(`🧂 Salt:       ${saltHex}`);
  console.log(`🔒 PBKDF2:     ${pbkdf2Hash}\n`);
  console.log('------------------------------------------------------');
  console.log('📌 COMANDO PARA APLICAR EN LOCAL (D1 Local):');
  console.log('------------------------------------------------------');
  console.log(`\x1b[36mnpx wrangler d1 execute vendly-db --local --command="${sqlInsert}"\x1b[0m\n`);
  console.log('------------------------------------------------------');
  console.log('☁️  COMANDO PARA APLICAR EN CLOUDFLARE (D1 Producción):');
  console.log('------------------------------------------------------');
  console.log(`\x1b[35mnpx wrangler d1 execute vendly-db --remote --command="${sqlInsert}"\x1b[0m\n`);
  console.log('======================================================\n');
}

main().catch(console.error);
