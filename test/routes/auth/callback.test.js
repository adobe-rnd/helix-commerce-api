/*
 * Copyright 2025 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

// @ts-nocheck

import assert from 'node:assert';
import { DEFAULT_CONTEXT } from '../../fixtures/context.js';
import handler from '../../../src/routes/auth/callback.js';

/**
 * Helper to create HMAC hash (duplicated from login.js for testing)
 */
async function createOTPHash(email, code, exp, secret) {
  const encoder = new TextEncoder();
  const data = encoder.encode(`${email}:${code}:${exp}`);
  const keyData = encoder.encode(secret);

  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign('HMAC', key, data);
  const hashArray = Array.from(new Uint8Array(signature));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

describe('routes/auth callback tests', () => {
  const secret = 'test-secret';
  const jwtSecret = 'test-jwt-secret';
  const email = 'test@example.com';

  it('should return 500 if OTP_SECRET is missing', async () => {
    const ctx = DEFAULT_CONTEXT({
      data: {
        email, code: '123456', hash: 'somehash', exp: Date.now() + 1000,
      },
      env: {
        JWT_SECRET: jwtSecret,
        // OTP_SECRET missing
      },
    });
    const resp = await handler(ctx);
    assert.equal(resp.status, 500);
    assert.equal(resp.headers.get('x-error'), 'internal server error');
  });

  it('should return 500 if JWT_SECRET is missing', async () => {
    const ctx = DEFAULT_CONTEXT({
      data: {
        email, code: '123456', hash: 'somehash', exp: Date.now() + 1000,
      },
      env: {
        OTP_SECRET: secret,
        // JWT_SECRET missing
      },
    });
    const resp = await handler(ctx);
    assert.equal(resp.status, 500);
    assert.equal(resp.headers.get('x-error'), 'internal server error');
  });

  it('should reject missing email', async () => {
    const ctx = DEFAULT_CONTEXT({
      data: { code: '123456', hash: 'somehash', exp: Date.now() + 1000 },
      env: {
        OTP_SECRET: secret,
        JWT_SECRET: jwtSecret,
      },
    });
    const resp = await handler(ctx);
    assert.equal(resp.status, 400);
    assert.equal(resp.headers.get('x-error'), 'missing or invalid email');
  });

  it('should reject missing code', async () => {
    const ctx = DEFAULT_CONTEXT({
      data: { email, hash: 'somehash', exp: Date.now() + 1000 },
      env: {
        OTP_SECRET: secret,
        JWT_SECRET: jwtSecret,
      },
    });
    const resp = await handler(ctx);
    assert.equal(resp.status, 400);
    assert.equal(resp.headers.get('x-error'), 'missing or invalid code');
  });

  it('should reject missing hash', async () => {
    const ctx = DEFAULT_CONTEXT({
      data: { email, code: '123456', exp: Date.now() + 1000 },
      env: {
        OTP_SECRET: secret,
        JWT_SECRET: jwtSecret,
      },
    });
    const resp = await handler(ctx);
    assert.equal(resp.status, 400);
    assert.equal(resp.headers.get('x-error'), 'missing or invalid hash');
  });

  it('should reject missing exp', async () => {
    const ctx = DEFAULT_CONTEXT({
      data: { email, code: '123456', hash: 'somehash' },
      env: {
        OTP_SECRET: secret,
        JWT_SECRET: jwtSecret,
      },
    });
    const resp = await handler(ctx);
    assert.equal(resp.status, 400);
    assert.equal(resp.headers.get('x-error'), 'missing or invalid exp');
  });

  // Test 1: valid attempts should succeed
  it('should succeed with valid code and hash', async () => {
    const code = '123456';
    const exp = Date.now() + 60000; // 1 minute from now
    const hash = await createOTPHash(email, code, exp, secret);

    const attemptsPuts = [];
    const revokedPuts = [];
    let deletedKey = null;

    const ctx = DEFAULT_CONTEXT({
      data: {
        email, code, hash, exp,
      },
      env: {
        OTP_SECRET: secret,
        JWT_SECRET: jwtSecret,
        AUTH_BUCKET: {
          head: async (key) => {
            if (key.includes('/attempts/')) {
              // First attempt, no file exists
              return null;
            }
            if (key.includes('/admins/')) {
              return null; // Not an admin
            }
            return null;
          },
          put: async (key, value, options) => {
            if (key.includes('/attempts/')) {
              attemptsPuts.push({ key, options });
              // Simulate successful PUT
            } else if (key.includes('/revoked-codes/')) {
              revokedPuts.push({ key, options });
              // Simulate successful conditional PUT (hash not yet revoked)
            }
          },
          delete: async (key) => {
            deletedKey = key;
          },
        },
      },
    });

    const resp = await handler(ctx);
    assert.equal(resp.status, 200);
    assert.equal(resp.headers.get('Content-Type'), 'application/json');

    const data = await resp.json();
    assert.equal(data.success, true);
    assert.equal(data.email, email);

    // Check cookie was set
    const setCookie = resp.headers.get('Set-Cookie');
    assert.ok(setCookie, 'should set cookie');
    assert.ok(setCookie.includes('auth_token='), 'should contain auth_token');
    assert.ok(setCookie.includes('HttpOnly'), 'should be HttpOnly');
    assert.ok(setCookie.includes('Secure'), 'should be Secure');

    // Check attempts file was created
    assert.equal(attemptsPuts.length, 1);
    assert.equal(attemptsPuts[0].options.customMetadata.attempts, '1');

    // Check hash was revoked with conditional PUT
    assert.equal(revokedPuts.length, 1);
    assert.ok(revokedPuts[0].key.includes(hash));
    assert.ok(revokedPuts[0].options.onlyIf);
    assert.equal(revokedPuts[0].options.onlyIf.etagDoesNotMatch, '*');
    // Check expiration metadata
    assert.ok(revokedPuts[0].options.customMetadata.expiresAt);

    // Check attempts file was deleted on success
    assert.ok(deletedKey, 'should delete attempts file');
    assert.ok(deletedKey.includes('/attempts/'));
    assert.ok(deletedKey.includes(email));
  });

  // Test 2: incorrect codes should increment attempts file
  it('should increment attempts file on incorrect code', async () => {
    const code = '123456';
    const wrongCode = '999999';
    const exp = Date.now() + 60000;
    const hash = await createOTPHash(email, code, exp, secret);

    const attemptsPuts = [];

    const ctx = DEFAULT_CONTEXT({
      data: {
        email, code: wrongCode, hash, exp,
      },
      env: {
        OTP_SECRET: secret,
        JWT_SECRET: jwtSecret,
        AUTH_BUCKET: {
          head: async (key) => {
            if (key.includes('/attempts/')) {
              return null; // No attempts yet
            }
            return null;
          },
          put: async (key, value, options) => {
            if (key.includes('/attempts/')) {
              attemptsPuts.push({ key, options });
            }
          },
        },
      },
    });

    const resp = await handler(ctx);
    assert.equal(resp.status, 401);
    assert.equal(resp.headers.get('x-error'), 'invalid code');

    // Check attempts file was incremented
    assert.equal(attemptsPuts.length, 1);
    assert.equal(attemptsPuts[0].options.customMetadata.attempts, '1');
  });

  // Test 3: exceeding attempts should fail with 401
  it('should fail with 401 after exceeding attempts threshold', async () => {
    const code = '123456';
    const exp = Date.now() + 60000;
    const hash = await createOTPHash(email, code, exp, secret);

    const attemptsPuts = [];

    const ctx = DEFAULT_CONTEXT({
      data: {
        email, code, hash, exp,
      },
      env: {
        OTP_SECRET: secret,
        JWT_SECRET: jwtSecret,
        AUTH_BUCKET: {
          head: async (key) => {
            if (key.includes('/attempts/')) {
              // Already at max attempts (3)
              return {
                customMetadata: { attempts: '3' },
                etag: 'test-etag',
              };
            }
            return null;
          },
          put: async (key, value, options) => {
            if (key.includes('/attempts/')) {
              attemptsPuts.push({ key, options });
            }
          },
        },
      },
    });

    const resp = await handler(ctx);
    assert.equal(resp.status, 401);
    assert.equal(resp.headers.get('x-error'), 'invalid code');

    // Check NO attempts file was created (early reject)
    assert.equal(attemptsPuts.length, 0, 'should not increment when already at threshold');
  });

  // Test 4: exceeding attempts in parallel should fail with 401
  it('should handle parallel requests at threshold correctly', async () => {
    const code = '123456';
    const exp = Date.now() + 60000;
    const hash = await createOTPHash(email, code, exp, secret);

    let headCalls = 0;
    let putCalls = 0;

    const ctx = DEFAULT_CONTEXT({
      data: {
        email, code, hash, exp,
      },
      env: {
        OTP_SECRET: secret,
        JWT_SECRET: jwtSecret,
        AUTH_BUCKET: {
          head: async (key) => {
            if (key.includes('/attempts/')) {
              headCalls += 1;
              // Simulate at threshold (3 attempts)
              return {
                customMetadata: { attempts: '3' },
                etag: `etag-${headCalls}`,
              };
            }
            return null;
          },
          put: async (key) => {
            if (key.includes('/attempts/')) {
              putCalls += 1;
              // Should not be called due to early reject
            }
          },
        },
      },
    });

    const resp = await handler(ctx);
    assert.equal(resp.status, 401);
    assert.equal(headCalls, 1, 'should check attempts once');
    assert.equal(putCalls, 0, 'should not increment due to early reject');
  });

  // Test 5: parallel invocations on first invocation should increment attempts file twice
  it('should handle concurrent first attempts correctly', async () => {
    const code = '123456';
    const exp = Date.now() + 60000;
    const hash = await createOTPHash(email, code, exp, secret);

    let headCalls = 0;
    let putCalls = 0;
    let firstPutFailed = false;

    // Simulate two concurrent requests
    const createContext = (shouldFailFirstPut) => DEFAULT_CONTEXT({
      data: {
        email, code, hash, exp,
      },
      env: {
        OTP_SECRET: secret,
        JWT_SECRET: jwtSecret,
        AUTH_BUCKET: {
          head: async (key) => {
            if (key.includes('/attempts/')) {
              headCalls += 1;
              if (headCalls === 1 || headCalls === 3) {
                // First HEAD or retry HEAD - no file exists
                return null;
              }
              // Second HEAD after first PUT succeeded
              return {
                customMetadata: { attempts: '1' },
                etag: 'etag-1',
              };
            }
            if (key.includes('/revoked-codes/')) {
              return null;
            }
            return null;
          },
          put: async (key) => {
            if (key.includes('/attempts/')) {
              putCalls += 1;
              if (shouldFailFirstPut && putCalls === 1 && !firstPutFailed) {
                firstPutFailed = true;
                // Simulate conditional PUT failure (someone else created it)
                const error = new Error('Precondition failed');
                error.code = 'PRECONDITION_FAILED';
                throw error;
              }
              // Success
            } else if (key.includes('/revoked-codes/')) {
              // Revoke hash
            }
          },
          delete: async () => {},
        },
      },
    });

    // First request succeeds
    const ctx1 = createContext(false);
    const resp1 = await handler(ctx1);
    assert.equal(resp1.status, 200);

    // Reset counters
    headCalls = 0;
    putCalls = 0;

    // Second concurrent request should retry and increment to 2
    const ctx2 = createContext(true);
    const resp2 = await handler(ctx2);
    assert.equal(resp2.status, 200);

    // Should have retried after first PUT failed
    assert.ok(headCalls >= 2, 'should HEAD multiple times due to retry');
    assert.ok(putCalls >= 2, 'should PUT multiple times (initial + retry)');
  });

  it('should reject expired code', async () => {
    const code = '123456';
    const exp = Date.now() - 1000; // Expired 1 second ago
    const hash = await createOTPHash(email, code, exp, secret);

    const attemptsPuts = [];

    const ctx = DEFAULT_CONTEXT({
      data: {
        email, code, hash, exp,
      },
      env: {
        OTP_SECRET: secret,
        JWT_SECRET: jwtSecret,
        AUTH_BUCKET: {
          head: async () => null,
          put: async (key, value, options) => {
            if (key.includes('/attempts/')) {
              attemptsPuts.push({ key, options });
            }
          },
        },
      },
    });

    const resp = await handler(ctx);
    assert.equal(resp.status, 401);
    assert.equal(resp.headers.get('x-error'), 'invalid code');

    // Should still increment attempts even for expired code
    assert.equal(attemptsPuts.length, 1);
  });

  it('should reject already used hash', async () => {
    const code = '123456';
    const exp = Date.now() + 60000;
    const hash = await createOTPHash(email, code, exp, secret);

    const ctx = DEFAULT_CONTEXT({
      data: {
        email, code, hash, exp,
      },
      env: {
        OTP_SECRET: secret,
        JWT_SECRET: jwtSecret,
        AUTH_BUCKET: {
          head: async (key) => {
            if (key.includes('/attempts/')) {
              return null;
            }
            return null;
          },
          put: async (key) => {
            if (key.includes('/attempts/')) {
              // Increment attempts
            } else if (key.includes('/revoked-codes/')) {
              // Simulate hash already revoked (conditional PUT fails)
              const error = new Error('Precondition failed');
              error.code = 'PRECONDITION_FAILED';
              throw error;
            }
          },
        },
      },
    });

    const resp = await handler(ctx);
    assert.equal(resp.status, 401);
    assert.equal(resp.headers.get('x-error'), 'invalid code');
  });

  it('should normalize email before processing', async () => {
    const code = '123456';
    const exp = Date.now() + 60000;
    const normalizedEmail = 'test@example.com';
    const inputEmail = '  TEST@EXAMPLE.COM  ';
    const hash = await createOTPHash(normalizedEmail, code, exp, secret);

    const ctx = DEFAULT_CONTEXT({
      data: {
        email: inputEmail, code, hash, exp,
      },
      env: {
        OTP_SECRET: secret,
        JWT_SECRET: jwtSecret,
        AUTH_BUCKET: {
          head: async () => null,
          put: async () => {},
          delete: async () => {},
        },
      },
    });

    const resp = await handler(ctx);
    assert.equal(resp.status, 200);
    const data = await resp.json();
    assert.equal(data.email, normalizedEmail);
  });

  it('should assign "user" role when user is not an admin', async () => {
    const code = '123456';
    const exp = Date.now() + 60000;
    const hash = await createOTPHash(email, code, exp, secret);

    const ctx = DEFAULT_CONTEXT({
      data: {
        email, code, hash, exp,
      },
      env: {
        OTP_SECRET: secret,
        JWT_SECRET: jwtSecret,
        AUTH_BUCKET: {
          head: async (key) => {
            if (key.includes('/attempts/')) {
              return null;
            }
            if (key.includes('/revoked-codes/')) {
              return null;
            }
            if (key.includes('/admins/')) {
              // User is not an admin
              return null;
            }
            return null;
          },
          put: async () => {},
          delete: async () => {},
        },
      },
    });

    const resp = await handler(ctx);
    assert.equal(resp.status, 200);

    // Extract and decode the JWT from the cookie
    const setCookie = resp.headers.get('Set-Cookie');
    const tokenMatch = setCookie.match(/auth_token=([^;]+)/);
    assert.ok(tokenMatch, 'should have auth_token in cookie');

    const token = tokenMatch[1];
    // Decode JWT payload (simple base64 decode of middle part)
    const parts = token.split('.');
    const payload = JSON.parse(atob(parts[1]));

    assert.equal(payload.email, email);
    assert.ok(Array.isArray(payload.roles), 'should have roles array');
    assert.deepEqual(payload.roles, ['user'], 'should have user role');
  });

  it('should assign "admin" role when user is an admin', async () => {
    const code = '123456';
    const exp = Date.now() + 60000;
    const hash = await createOTPHash(email, code, exp, secret);

    const ctx = DEFAULT_CONTEXT({
      data: {
        email, code, hash, exp,
      },
      env: {
        OTP_SECRET: secret,
        JWT_SECRET: jwtSecret,
        AUTH_BUCKET: {
          head: async (key) => {
            if (key.includes('/attempts/')) {
              return null;
            }
            if (key.includes('/revoked-codes/')) {
              return null;
            }
            if (key.includes('/admins/')) {
              // User is an admin
              return {
                customMetadata: {
                  dateAdded: '2025-01-21T12:00:00Z',
                  addedBy: '192.168.1.1',
                },
              };
            }
            return null;
          },
          put: async () => {},
          delete: async () => {},
        },
      },
    });

    const resp = await handler(ctx);
    assert.equal(resp.status, 200);

    // Extract and decode the JWT from the cookie
    const setCookie = resp.headers.get('Set-Cookie');
    const tokenMatch = setCookie.match(/auth_token=([^;]+)/);
    assert.ok(tokenMatch, 'should have auth_token in cookie');

    const token = tokenMatch[1];
    // Decode JWT payload (simple base64 decode of middle part)
    const parts = token.split('.');
    const payload = JSON.parse(atob(parts[1]));

    assert.equal(payload.email, email);
    assert.ok(Array.isArray(payload.roles), 'should have roles array');
    assert.deepEqual(payload.roles, ['admin'], 'should have admin role');
  });

  it('should check admin status with correct key format', async () => {
    const code = '123456';
    const exp = Date.now() + 60000;
    const hash = await createOTPHash(email, code, exp, secret);

    let adminKeyChecked;

    const ctx = DEFAULT_CONTEXT({
      requestInfo: {
        org: 'testorg',
        site: 'testsite',
      },
      data: {
        email, code, hash, exp,
      },
      env: {
        OTP_SECRET: secret,
        JWT_SECRET: jwtSecret,
        AUTH_BUCKET: {
          head: async (key) => {
            if (key.includes('/attempts/')) {
              return null;
            }
            if (key.includes('/revoked-codes/')) {
              return null;
            }
            if (key.includes('/admins/')) {
              adminKeyChecked = key;
              return null;
            }
            return null;
          },
          put: async () => {},
          delete: async () => {},
        },
      },
    });

    await handler(ctx);
    assert.equal(adminKeyChecked, 'testorg/testsite/admins/test@example.com');
  });
});
