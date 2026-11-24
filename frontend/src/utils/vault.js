// Private vault: files are encrypted in the browser with a key derived from the vault password
// (PBKDF2-SHA256 -> AES-256-GCM) and only the ciphertext is uploaded. The server stores
// the salt and an encrypted check value (to recognize a wrong password) but never the password or key.
import { apiRequest, ApiError, checkUpload, uploadWithProgress } from './api';

const ITERATIONS = 210000;
const CHECK_TEXT = 'udrive-vault-v2';
const IV_LENGTH = 12;

export class VaultError extends Error {
  constructor(code) {
    super(code);
    this.name = 'VaultError';
    this.code = code;
  }
}

export function isCryptoAvailable() {
  return typeof crypto !== 'undefined' && Boolean(crypto.subtle);
}

function assertCrypto() {
  if (!isCryptoAvailable()) throw new VaultError('CRYPTO_UNAVAILABLE');
}

function bytesToBase64(bytes) {
  let binary = '';
  const view = new Uint8Array(bytes);
  const chunk = 0x8000;
  for (let i = 0; i < view.length; i += chunk) {
    binary += String.fromCharCode(...view.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function randomBytes(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

async function deriveKey(passphrase, saltBytes, iterations = ITERATIONS) {
  assertCrypto();
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltBytes, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function encryptText(key, text) {
  const iv = randomBytes(IV_LENGTH);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text));
  return { iv: bytesToBase64(iv), data: bytesToBase64(encrypted) };
}

async function decryptText(key, payload) {
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(payload.iv) },
    key,
    base64ToBytes(payload.data),
  );
  return new TextDecoder().decode(decrypted);
}

// ---- vault config (on the server) -------------------------------------------

// Returns the vault config, or null when this account has no vault yet.
export async function getVaultConfig() {
  try {
    return await apiRequest('/api/vault/config');
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

// Creates the vault and returns { key, config }.
export async function createVault(passphrase) {
  if (!passphrase || passphrase.length < 8) throw new VaultError('PASSPHRASE_SHORT');
  assertCrypto();

  const saltBytes = randomBytes(16);
  const key = await deriveKey(passphrase, saltBytes);
  const config = {
    version: 2,
    iterations: ITERATIONS,
    salt: bytesToBase64(saltBytes),
    check: await encryptText(key, CHECK_TEXT),
    createdAt: Date.now(),
  };
  try {
    await apiRequest('/api/vault/config', { method: 'PUT', json: config });
  } catch (error) {
    throw new VaultError(error instanceof ApiError ? error.code : 'NETWORK_ERROR');
  }
  return { key, config };
}

export async function unlockVault(config, passphrase) {
  if (!config) throw new VaultError('NO_VAULT');
  assertCrypto();
  try {
    const key = await deriveKey(passphrase, base64ToBytes(config.salt), config.iterations || ITERATIONS);
    if ((await decryptText(key, config.check)) !== CHECK_TEXT) throw new Error('Bad check');
    return key;
  } catch {
    throw new VaultError('WRONG_PASSPHRASE');
  }
}

// Forgotten password: deletes the vault config and every encrypted file on the server.
export async function resetVault() {
  await apiRequest('/api/vault/config', { method: 'DELETE' });
}

// ---- encrypted files -----------------------------------------------------------

// Server item -> { id, name, mime, rawSize, createdAt } with the name decrypted.
async function toVaultItem(key, meta) {
  let info = {};
  try {
    info = JSON.parse(await decryptText(key, JSON.parse(meta.secret)));
  } catch {
    // Unreadable metadata (should not happen with the right key): still list the file.
  }
  return {
    id: meta.id,
    name: info.name || 'file',
    mime: info.mime || 'application/octet-stream',
    rawSize: info.size ?? meta.size,
    createdAt: meta.createdAt,
  };
}

export async function listVaultFiles(key) {
  const list = await apiRequest('/api/vault');
  return Promise.all((Array.isArray(list) ? list : []).map((meta) => toVaultItem(key, meta)));
}

// Encrypts the file (content and name) and uploads it. Stored as: 12-byte IV + AES-GCM ciphertext.
// The server checks size and quota first, so nothing is encrypted for an upload that can't fit.
export async function uploadVaultFile(key, file, { onProgress } = {}) {
  assertCrypto();
  await checkUpload([file.size]);
  const iv = randomBytes(IV_LENGTH);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, await file.arrayBuffer());
  const secret = await encryptText(
    key,
    JSON.stringify({ name: file.name, mime: file.type || 'application/octet-stream', size: file.size }),
  );

  const meta = await uploadWithProgress('/api/vault', new Blob([iv, encrypted]), {
    headers: { 'Content-Type': 'application/octet-stream', 'X-Vault-Secret': JSON.stringify(secret) },
    onProgress,
  });
  return toVaultItem(key, meta);
}

// Downloads, decrypts and saves the file in the browser.
export async function downloadVaultFile(key, item) {
  const response = await fetch(`/api/vault/${encodeURIComponent(item.id)}/content`, {
    credentials: 'same-origin',
  });
  if (!response.ok) throw new VaultError('DOWNLOAD_FAILED');
  const bytes = new Uint8Array(await response.arrayBuffer());
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: bytes.subarray(0, IV_LENGTH) },
    key,
    bytes.subarray(IV_LENGTH),
  );

  const url = URL.createObjectURL(new Blob([decrypted], { type: item.mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = item.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function deleteVaultFile(id) {
  await apiRequest(`/api/vault/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function passphraseScore(passphrase = '') {
  if (!passphrase) return 0;
  let score = 0;
  if (passphrase.length >= 8) score += 1;
  if (passphrase.length >= 12) score += 1;
  if (/[a-z]/i.test(passphrase) && /\d/.test(passphrase)) score += 1;
  if (/[^a-z0-9]/i.test(passphrase)) score += 1;
  return Math.min(3, Math.max(1, score));
}
