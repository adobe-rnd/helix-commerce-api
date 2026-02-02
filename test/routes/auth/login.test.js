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
import esmock from 'esmock';
import { DEFAULT_CONTEXT } from '../../fixtures/context.js';

describe('routes/auth login tests', () => {
  const otpSecret = 'test-secret';
  const jwtSecret = 'test-jwt-secret';
  const resendApiKey = 'test-resend-api-key';

  let handler;
  let sendEmailStub;

  beforeEach(async () => {
    // Mock the resend library
    sendEmailStub = async () => ({ data: { id: 'mock-email-id' }, error: null });
    handler = await esmock('../../../src/routes/auth/login.js', {
      '../../../src/utils/email.js': {
        sendEmail: sendEmailStub,
        normalizeEmail: (email) => email.trim().toLowerCase(),
        isValidEmail: (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
      },
    });
  });

  it('should return 500 if OTP_SECRET is missing', async () => {
    const ctx = DEFAULT_CONTEXT({
      data: { email: 'test@example.com' },
      env: {
        JWT_SECRET: jwtSecret,
        // OTP_SECRET missing
        AUTH_BUCKET: { head: async () => ({ customMetadata: {} }) },
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
        AUTH_BUCKET: { head: async () => ({ customMetadata: {} }) },
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
        AUTH_BUCKET: { head: async () => ({ customMetadata: {} }) },
      },
    });
    const resp = await handler(ctx);
    assert.equal(resp.status, 400);
    assert.equal(resp.headers.get('x-error'), 'missing or invalid email');
  });

  it('should throw 500 response error if RESEND_API_KEY is missing', async () => {
    // Mock sendEmail to throw when RESEND_API_KEY is missing
    const noKeyHandler = await esmock('../../../src/routes/auth/login.js', {
      '../../../src/utils/email.js': {
        sendEmail: async (ctx) => {
          // This mimics the real sendEmail behavior when RESEND_API_KEY is missing
          if (!ctx.env.RESEND_API_KEY) {
            const error = new Error('internal server error');
            error.response = {
              status: 500,
              headers: new Map([['x-error', 'internal server error']]),
            };
            throw error;
          }
        },
        normalizeEmail: (email) => email.trim().toLowerCase(),
        isValidEmail: (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
      },
    });

    const ctx = DEFAULT_CONTEXT({
      data: { email: 'test@example.com' },
      env: {
        OTP_SECRET: otpSecret,
        JWT_SECRET: jwtSecret,
        // RESEND_API_KEY missing
        AUTH_BUCKET: { head: async () => ({ customMetadata: {} }) },
      },
    });
    let error;
    try {
      await noKeyHandler(ctx);
    } catch (err) {
      error = err;
    }
    assert.ok(error, 'should throw an error');
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
        AUTH_BUCKET: { head: async () => ({ customMetadata: {} }) },
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
        AUTH_BUCKET: { head: async () => ({ customMetadata: {} }) },
      },
    });
    const resp = await handler(ctx);
    assert.equal(resp.status, 200);
    const data = await resp.json();
    assert.equal(data.email, 'test@example.com', 'should return normalized email');
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
        AUTH_BUCKET: { head: async () => ({ customMetadata: {} }) },
      },
    });
    const resp = await handler(ctx);
    assert.equal(resp.status, 200);
    assert.equal(resp.headers.get('Content-Type'), 'application/json');

    const data = await resp.json();
    assert.equal(data.email, 'test@example.com', 'should return email');
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
        AUTH_BUCKET: { head: async () => ({ customMetadata: {} }) },
      },
    });
    const ctx2 = DEFAULT_CONTEXT({
      data: { email: 'test2@example.com' },
      env: {
        OTP_SECRET: otpSecret,
        JWT_SECRET: jwtSecret,
        RESEND_API_KEY: resendApiKey,
        AUTH_BUCKET: { head: async () => ({ customMetadata: {} }) },
      },
    });

    const resp1 = await handler(ctx1);
    const resp2 = await handler(ctx2);

    const data1 = await resp1.json();
    const data2 = await resp2.json();

    assert.equal(data1.email, 'test1@example.com');
    assert.equal(data2.email, 'test2@example.com');
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
        AUTH_BUCKET: { head: async () => ({ customMetadata: {} }) },
      },
    });
    const resp = await handler(ctx);
    assert.equal(resp.status, 200);
    const data = await resp.json();
    assert.equal(data.email, 'nonexistent@example.com');
    assert.ok(data.hash);
    assert.ok(data.exp);
  });

  it('should throw 500 error when sendEmail fails', async () => {
    // Mock sendEmail to throw an error
    const errorHandler = await esmock('../../../src/routes/auth/login.js', {
      '../../../src/utils/email.js': {
        sendEmail: async () => {
          const error = new Error('internal server error');
          error.response = {
            status: 500,
            headers: new Map([['x-error', 'internal server error']]),
          };
          throw error;
        },
        normalizeEmail: (email) => email.trim().toLowerCase(),
        isValidEmail: (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
      },
    });

    const ctx = DEFAULT_CONTEXT({
      data: { email: 'test@example.com' },
      env: {
        OTP_SECRET: otpSecret,
        JWT_SECRET: jwtSecret,
        RESEND_API_KEY: resendApiKey,
        AUTH_BUCKET: { head: async () => ({ customMetadata: {} }) },
      },
    });

    let error;
    try {
      await errorHandler(ctx);
    } catch (err) {
      error = err;
    }

    assert.ok(error, 'should throw error');
    assert.equal(error.response.status, 500);
    assert.equal(error.response.headers.get('x-error'), 'internal server error');
  });
});
