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

// @ts-nocheck

import assert from 'node:assert';
import sinon from 'sinon';
import esmock from 'esmock';
import { DEFAULT_CONTEXT, createAuthInfoMock } from '../../fixtures/context.js';
import { emailMatchesScope } from '../../../src/utils/AuthInfo.js';

describe('routes/emails/handler tests', () => {
  let handler;
  let sendEmailStub;

  beforeEach(async () => {
    sendEmailStub = sinon.stub().resolves();
    handler = await esmock('../../../src/routes/emails/handler.js', {
      '../../../src/utils/email.js': {
        sendEmail: sendEmailStub,
        isValidEmail: (await import('../../../src/utils/email.js')).isValidEmail,
        normalizeEmail: (await import('../../../src/utils/email.js')).normalizeEmail,
      },
      '../../../src/utils/config.js': {
        fetchProductBusConfig: async () => ({ otpEmailSender: 'noreply@site.com' }),
      },
    });
  });

  afterEach(() => {
    sinon.restore();
  });

  function emailContext(data, permissions = [], opts = {}) {
    return DEFAULT_CONTEXT({
      data,
      requestInfo: {
        method: 'POST',
        org: 'org',
        site: 'site',
      },
      authInfo: createAuthInfoMock(permissions, null, { ...opts, emailMatchesScope }),
    });
  }

  it('should reject non-POST requests', async () => {
    const ctx = DEFAULT_CONTEXT({
      data: {},
      requestInfo: { method: 'GET' },
      authInfo: createAuthInfoMock(['emails:send']),
    });
    const resp = await handler.default(ctx);
    assert.equal(resp.status, 405);
  });

  it('should reject unauthenticated requests', async () => {
    const ctx = DEFAULT_CONTEXT({
      data: {},
      requestInfo: { method: 'POST' },
    });
    await assert.rejects(
      () => handler.default(ctx),
      (err) => err.response?.status === 401,
    );
  });

  it('should reject requests without emails:send permission', async () => {
    const ctx = emailContext(
      { html: '<p>hi</p>', subject: 'test', toEmail: 'user@example.com' },
      ['catalog:read'],
    );
    await assert.rejects(
      () => handler.default(ctx),
      (err) => err.response?.status === 403,
    );
  });

  it('should reject missing html', async () => {
    const ctx = emailContext(
      { subject: 'test', toEmail: 'user@example.com' },
      ['emails:send', 'emails:send:user@example.com'],
    );
    const resp = await handler.default(ctx);
    assert.equal(resp.status, 400);
    assert.equal(resp.headers.get('x-error'), 'html is required and must be a string');
  });

  it('should reject missing subject', async () => {
    const ctx = emailContext(
      { html: '<p>hi</p>', toEmail: 'user@example.com' },
      ['emails:send', 'emails:send:user@example.com'],
    );
    const resp = await handler.default(ctx);
    assert.equal(resp.status, 400);
    assert.equal(resp.headers.get('x-error'), 'subject is required and must be a string');
  });

  it('should reject missing toEmail', async () => {
    const ctx = emailContext(
      { html: '<p>hi</p>', subject: 'test' },
      ['emails:send', 'emails:send:user@example.com'],
    );
    const resp = await handler.default(ctx);
    assert.equal(resp.status, 400);
    assert.equal(resp.headers.get('x-error'), 'toEmail is required');
  });

  it('should reject invalid toEmail', async () => {
    const ctx = emailContext(
      { html: '<p>hi</p>', subject: 'test', toEmail: 'not-an-email' },
      ['emails:send', 'emails:send:*@example.com'],
    );
    const resp = await handler.default(ctx);
    assert.equal(resp.status, 400);
    assert.ok(resp.headers.get('x-error').includes('invalid email'));
  });

  it('should reject non-array cc', async () => {
    const ctx = emailContext(
      {
        html: '<p>hi</p>', subject: 'test', toEmail: 'user@example.com', cc: 'user2@example.com',
      },
      ['emails:send', 'emails:send:*@example.com'],
    );
    const resp = await handler.default(ctx);
    assert.equal(resp.status, 400);
    assert.equal(resp.headers.get('x-error'), 'cc must be an array');
  });

  it('should reject non-array bcc', async () => {
    const ctx = emailContext(
      {
        html: '<p>hi</p>', subject: 'test', toEmail: 'user@example.com', bcc: 'user2@example.com',
      },
      ['emails:send', 'emails:send:*@example.com'],
    );
    const resp = await handler.default(ctx);
    assert.equal(resp.status, 400);
    assert.equal(resp.headers.get('x-error'), 'bcc must be an array');
  });

  it('should reject too many recipients', async () => {
    const emails = Array.from({ length: 51 }, (_, i) => `user${i}@example.com`);
    const ctx = emailContext(
      { html: '<p>hi</p>', subject: 'test', toEmail: emails },
      ['emails:send', 'emails:send:*@example.com'],
    );
    const resp = await handler.default(ctx);
    assert.equal(resp.status, 400);
    assert.ok(resp.headers.get('x-error').includes('total recipients exceeds maximum'));
  });

  it('should reject emails outside allowed scope', async () => {
    const ctx = emailContext(
      { html: '<p>hi</p>', subject: 'test', toEmail: 'user@forbidden.com' },
      ['emails:send', 'emails:send:*@example.com'],
    );
    await assert.rejects(
      () => handler.default(ctx),
      (err) => err.response?.status === 403,
    );
  });

  it('should reject cc emails outside allowed scope', async () => {
    const ctx = emailContext(
      {
        html: '<p>hi</p>',
        subject: 'test',
        toEmail: 'user@example.com',
        cc: ['forbidden@other.com'],
      },
      ['emails:send', 'emails:send:*@example.com'],
    );
    await assert.rejects(
      () => handler.default(ctx),
      (err) => err.response?.status === 403,
    );
  });

  it('should send email with single toEmail', async () => {
    const ctx = emailContext(
      { html: '<p>hi</p>', subject: 'Hello', toEmail: 'user@example.com' },
      ['emails:send', 'emails:send:*@example.com'],
    );
    const resp = await handler.default(ctx);
    assert.equal(resp.status, 200);
    const body = await resp.json();
    assert.equal(body.success, true);

    assert.equal(sendEmailStub.calledOnce, true);
    const [, from, to, subject, html, options] = sendEmailStub.firstCall.args;
    assert.equal(from, 'noreply@site.com');
    assert.deepStrictEqual(to, ['user@example.com']);
    assert.equal(subject, 'Hello');
    assert.equal(html, '<p>hi</p>');
    assert.equal(options.cc, undefined);
    assert.equal(options.bcc, undefined);
  });

  it('should send email with array toEmail, cc, and bcc', async () => {
    const ctx = emailContext(
      {
        html: '<p>hi</p>',
        subject: 'Hello',
        toEmail: ['a@example.com', 'b@example.com'],
        cc: ['c@example.com'],
        bcc: ['d@example.com'],
      },
      ['emails:send', 'emails:send:*@example.com'],
    );
    const resp = await handler.default(ctx);
    assert.equal(resp.status, 200);

    const [, , to, , , options] = sendEmailStub.firstCall.args;
    assert.deepStrictEqual(to, ['a@example.com', 'b@example.com']);
    assert.deepStrictEqual(options.cc, ['c@example.com']);
    assert.deepStrictEqual(options.bcc, ['d@example.com']);
  });

  it('should send email with exact email scope match', async () => {
    const ctx = emailContext(
      { html: '<p>hi</p>', subject: 'Hello', toEmail: 'specific@bar.com' },
      ['emails:send', 'emails:send:specific@bar.com'],
    );
    const resp = await handler.default(ctx);
    assert.equal(resp.status, 200);
  });

  it('should reject html exceeding size limit', async () => {
    const largeHtml = 'x'.repeat(256 * 1024 + 1);
    const ctx = emailContext(
      { html: largeHtml, subject: 'test', toEmail: 'user@example.com' },
      ['emails:send', 'emails:send:*@example.com'],
    );
    const resp = await handler.default(ctx);
    assert.equal(resp.status, 400);
    assert.ok(resp.headers.get('x-error').includes('html exceeds maximum size'));
  });
});
