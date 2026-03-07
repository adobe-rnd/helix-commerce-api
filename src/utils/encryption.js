/*
 * Copyright 2026 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

const BLOB_VERSION = 'v1';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Derive a per-tenant AES-GCM-256 key from the master key using HKDF.
 *
 * @param {string} secretsPK - Base64-encoded master key (IKM)
 * @param {string} org
 * @param {string} site
 * @returns {Promise<CryptoKey>}
 */
export async function deriveKey(secretsPK, org, site) {
  const ikm = Uint8Array.from(atob(secretsPK), (c) => c.charCodeAt(0));
  const baseKey = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(32),
      info: encoder.encode(`${org}/${site}`),
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Encrypt plaintext with AES-GCM and return a versioned blob.
 * Format: `v1:<base64(12-byte-iv + ciphertext + 16-byte-tag)>`
 *
 * @param {CryptoKey} key - AES-GCM-256 key from {@link deriveKey}
 * @param {string} plaintext
 * @returns {Promise<string>}
 */
export async function encrypt(key, plaintext) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipherBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plaintext),
  );
  const combined = new Uint8Array(iv.length + cipherBuf.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(cipherBuf), iv.length);
  return `${BLOB_VERSION}:${btoa(String.fromCharCode(...combined))}`;
}

/**
 * Decrypt a versioned blob produced by {@link encrypt}.
 *
 * @param {CryptoKey} key - AES-GCM-256 key from {@link deriveKey}
 * @param {string} blob - Versioned blob string (`v1:...`)
 * @returns {Promise<string>}
 */
export async function decrypt(key, blob) {
  const colonIdx = blob.indexOf(':');
  const version = blob.slice(0, colonIdx);
  if (version !== BLOB_VERSION) {
    throw new Error(`unsupported secret blob version: ${version}`);
  }

  const combined = Uint8Array.from(atob(blob.slice(colonIdx + 1)), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

  const plainBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext,
  );
  return decoder.decode(plainBuf);
}
