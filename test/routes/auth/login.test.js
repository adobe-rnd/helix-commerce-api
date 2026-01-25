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
import handler from '../../../src/routes/auth/login.js';

describe('routes/auth login tests', () => {
  const otpSecret = 'test-secret';
  const jwtSecret = 'test-jwt-secret';
  const resendApiKey = 'test-resend-api-key';

  it('should return 500 if OTP_SECRET is missing', async () => {
    const ctx = DEFAULT_CONTEXT({
      data: { email: 'test@example.com' },
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
      data: { email: 'test@example.com' },
      env: {
        OTP_SECRET: otpSecret,
        // JWT_SECRET missing
      },
    });
    const resp = await handler(ctx);
    assert.equal(resp.status, 500);
    assert.equal(resp.headers.get('x-error'), 'internal server error');
  });

  it('should reject missing email', async () => {
    const ctx = DEFAULT_CONTEXT({
      data: {},
      env: {
        OTP_SECRET: otpSecret,
        JWT_SECRET: jwtSecret,
        RESEND_API_KEY: resendApiKey,
      },
    });
    const resp = await handler(ctx);
    assert.equal(resp.status, 400);
    assert.equal(resp.headers.get('x-error'), 'missing or invalid email');
  });

  it('should throw 500 response error if RESEND_API_KEY is missing', async () => {
    const ctx = DEFAULT_CONTEXT({
      data: { email: 'test@example.com' },
      env: {
        OTP_SECRET: otpSecret,
        JWT_SECRET: jwtSecret,
        // RESEND_API_KEY missing
      },
    });
    let error;
    try {
      await handler(ctx);
    } catch (err) {
      error = err;
    }
    assert.equal(error.response.status, 500);
    assert.equal(error.response.headers.get('x-error'), 'internal server error');
  });

  it('should reject invalid email format', async () => {
    const ctx = DEFAULT_CONTEXT({
      data: { email: 'not-an-email' },
      env: {
        OTP_SECRET: otpSecret,
        JWT_SECRET: jwtSecret,
        RESEND_API_KEY: resendApiKey,
      },
    });
    const resp = await handler(ctx);
    assert.equal(resp.status, 400);
    assert.equal(resp.headers.get('x-error'), 'invalid email format');
  });

  it('should normalize email (trim and lowercase)', async () => {
    const ctx = DEFAULT_CONTEXT({
      data: { email: '  TEST@EXAMPLE.COM  ' },
      env: {
        OTP_SECRET: otpSecret,
        JWT_SECRET: jwtSecret,
        RESEND_API_KEY: resendApiKey,
      },
    });
    const resp = await handler(ctx);
    assert.equal(resp.status, 200);
    const data = await resp.json();
    assert.ok(data.hash);
    assert.ok(data.exp);
  });

  it('should generate hash and expiration for valid email', async () => {
    const ctx = DEFAULT_CONTEXT({
      data: { email: 'test@example.com' },
      env: {
        OTP_SECRET: otpSecret,
        JWT_SECRET: jwtSecret,
        RESEND_API_KEY: resendApiKey,
      },
    });
    const resp = await handler(ctx);
    assert.equal(resp.status, 200);
    assert.equal(resp.headers.get('Content-Type'), 'application/json');

    const data = await resp.json();
    assert.ok(data.hash, 'should have hash');
    assert.ok(data.exp, 'should have exp');
    assert.equal(typeof data.hash, 'string');
    assert.equal(typeof data.exp, 'number');

    // Check expiration is about 5 minutes from now
    const expectedExp = Date.now() + (5 * 60 * 1000);
    const diff = Math.abs(data.exp - expectedExp);
    assert.ok(diff < 1000, 'expiration should be ~5 minutes from now');
  });

  it('should return different hashes for different emails', async () => {
    const ctx1 = DEFAULT_CONTEXT({
      data: { email: 'test1@example.com' },
      env: {
        OTP_SECRET: otpSecret,
        JWT_SECRET: jwtSecret,
        RESEND_API_KEY: resendApiKey,
      },
    });
    const ctx2 = DEFAULT_CONTEXT({
      data: { email: 'test2@example.com' },
      env: {
        OTP_SECRET: otpSecret,
        JWT_SECRET: jwtSecret,
        RESEND_API_KEY: resendApiKey,
      },
    });

    const resp1 = await handler(ctx1);
    const resp2 = await handler(ctx2);

    const data1 = await resp1.json();
    const data2 = await resp2.json();

    assert.notEqual(data1.hash, data2.hash, 'hashes should be different');
  });

  it('should always return 200 to prevent email enumeration', async () => {
    // Even for non-existent users, should return success
    const ctx = DEFAULT_CONTEXT({
      data: { email: 'nonexistent@example.com' },
      env: {
        OTP_SECRET: otpSecret,
        JWT_SECRET: jwtSecret,
        RESEND_API_KEY: resendApiKey,
      },
    });
    const resp = await handler(ctx);
    assert.equal(resp.status, 200);
    const data = await resp.json();
    assert.ok(data.hash);
    assert.ok(data.exp);
  });
});
