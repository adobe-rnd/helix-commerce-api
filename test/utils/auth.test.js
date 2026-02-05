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

import assert from 'node:assert';
import sinon from 'sinon';
import esmock from 'esmock';
import { DEFAULT_CONTEXT } from '../fixtures/context.js';

describe('auth utils tests', () => {
  describe('sendOTPEmail', () => {
    let sendOTPEmail;
    let sendEmailStub;
    let fetchStub;

    beforeEach(async () => {
      // Mock sendEmail
      sendEmailStub = sinon.stub();
      // Mock global fetch
      fetchStub = sinon.stub();
      global.fetch = fetchStub;

      const module = await esmock('../../src/utils/auth.js', {
        '../../src/utils/email.js': {
          sendEmail: sendEmailStub,
        },
      });

      sendOTPEmail = module.sendOTPEmail;
    });

    afterEach(() => {
      sinon.restore();
      delete global.fetch;
    });

    describe('sender email (fromEmail) logic', () => {
      it('should use otpEmailSender from config when available', async () => {
        const ctx = DEFAULT_CONTEXT({
          log: {
            info: sinon.stub(),
            warn: sinon.stub(),
            error: sinon.stub(),
          },
          requestInfo: {
            org: 'test-org',
            site: 'test-site',
          },
        });

        const config = {
          otpEmailSender: 'custom@sender.com',
        };

        sendEmailStub.resolves();

        await sendOTPEmail(ctx, 'user@example.com', '123456', config);

        // Verify sendEmail was called with the custom sender
        assert(sendEmailStub.calledOnce);
        const [, fromEmail] = sendEmailStub.firstCall.args;
        assert.strictEqual(fromEmail, 'custom@sender.com');
        assert(ctx.log.warn.notCalled);
      });

      it('should use env.FROM_EMAIL as fallback when otpEmailSender is not set', async () => {
        const ctx = DEFAULT_CONTEXT({
          log: {
            info: sinon.stub(),
            warn: sinon.stub(),
            error: sinon.stub(),
          },
          requestInfo: {
            org: 'test-org',
            site: 'test-site',
          },
          env: {
            FROM_EMAIL: 'fallback@env.com',
          },
        });

        const config = {}; // No otpEmailSender

        sendEmailStub.resolves();

        await sendOTPEmail(ctx, 'user@example.com', '123456', config);

        // Verify warning was logged
        assert(ctx.log.warn.calledOnce);
        assert(ctx.log.warn.calledWith(sinon.match(/fromEmail is not set/)));

        // Verify sendEmail was called with the env fallback
        assert(sendEmailStub.calledOnce);
        const [, fromEmail] = sendEmailStub.firstCall.args;
        assert.strictEqual(fromEmail, 'fallback@env.com');
      });

      it('should use DEFAULT_FROM_EMAIL when both otpEmailSender and env.FROM_EMAIL are not set', async () => {
        const ctx = DEFAULT_CONTEXT({
          log: {
            info: sinon.stub(),
            warn: sinon.stub(),
            error: sinon.stub(),
          },
          requestInfo: {
            org: 'test-org',
            site: 'test-site',
          },
          env: {}, // No FROM_EMAIL
        });

        const config = {}; // No otpEmailSender

        sendEmailStub.resolves();

        await sendOTPEmail(ctx, 'user@example.com', '123456', config);

        // Verify warning was logged
        assert(ctx.log.warn.calledOnce);

        // Verify sendEmail was called with the default sender
        assert(sendEmailStub.calledOnce);
        const [, fromEmail] = sendEmailStub.firstCall.args;
        assert.strictEqual(fromEmail, 'noreply@adobecommerce.live');
      });

      it('should use DEFAULT_FROM_EMAIL when config and env.FROM_EMAIL are empty strings', async () => {
        const ctx = DEFAULT_CONTEXT({
          log: {
            info: sinon.stub(),
            warn: sinon.stub(),
            error: sinon.stub(),
          },
          requestInfo: {
            org: 'test-org',
            site: 'test-site',
          },
          env: {
            FROM_EMAIL: '', // Empty string (falsy)
          },
        });

        const config = {
          otpEmailSender: '', // Empty string (falsy)
        };

        sendEmailStub.resolves();

        await sendOTPEmail(ctx, 'user@example.com', '123456', config);

        // Verify warning was logged (since otpEmailSender is falsy)
        assert(ctx.log.warn.calledOnce);

        // Empty strings are falsy, so DEFAULT_FROM_EMAIL should be used
        assert(sendEmailStub.calledOnce);
        const [, fromEmail] = sendEmailStub.firstCall.args;
        assert.strictEqual(fromEmail, 'noreply@adobecommerce.live');
      });
    });

    describe('email body logic', () => {
      it('should fetch template from otpEmailBodyUrl and replace {{code}}', async () => {
        const ctx = DEFAULT_CONTEXT({
          log: {
            info: sinon.stub(),
            warn: sinon.stub(),
            error: sinon.stub(),
          },
          requestInfo: {
            org: 'test-org',
            site: 'test-site',
          },
        });

        const config = {
          otpEmailSender: 'sender@test.com',
          otpEmailBodyUrl: 'https://example.com/template.html',
        };

        // Mock successful template fetch
        fetchStub.resolves({
          ok: true,
          status: 200,
          text: sinon.stub().resolves('<html>Your code is: {{code}}</html>'),
        });

        sendEmailStub.resolves();

        await sendOTPEmail(ctx, 'user@example.com', '123456', config);

        // Verify fetch was called with correct URL
        assert(fetchStub.calledOnce);
        const fetchUrl = fetchStub.firstCall.args[0];
        assert(fetchUrl.includes('helix-to-email.adobeaem.workers.dev'));
        assert(fetchUrl.includes(encodeURIComponent('https://example.com/template.html')));

        // Verify sendEmail was called with replaced template
        assert(sendEmailStub.calledOnce);
        const [, , , , body] = sendEmailStub.firstCall.args;
        assert.strictEqual(body, '<html>Your code is: 123456</html>');
      });

      it('should throw error when template fetch fails (non-ok response)', async () => {
        const ctx = DEFAULT_CONTEXT({
          log: {
            info: sinon.stub(),
            warn: sinon.stub(),
            error: sinon.stub(),
          },
          requestInfo: {
            org: 'test-org',
            site: 'test-site',
          },
        });

        const config = {
          otpEmailSender: 'sender@test.com',
          otpEmailBodyUrl: 'https://example.com/template.html',
        };

        // Mock failed template fetch
        fetchStub.resolves({
          ok: false,
          status: 404,
        });

        let thrownError;
        try {
          await sendOTPEmail(ctx, 'user@example.com', '123456', config);
        } catch (err) {
          thrownError = err;
        }

        // Verify error was logged
        assert(ctx.log.error.calledOnce);
        assert(ctx.log.error.calledWith(sinon.match(/failed to fetch OTP email body template/)));

        // Verify error was thrown
        assert(thrownError);
        assert.strictEqual(thrownError.response.status, 404);
        assert(thrownError.message.includes('template fetch failed'));
      });

      it('should use otpEmailBodyTemplate when otpEmailBodyUrl is not set', async () => {
        const ctx = DEFAULT_CONTEXT({
          log: {
            info: sinon.stub(),
            warn: sinon.stub(),
            error: sinon.stub(),
          },
          requestInfo: {
            org: 'test-org',
            site: 'test-site',
          },
        });

        const config = {
          otpEmailSender: 'sender@test.com',
          otpEmailBodyTemplate: 'Hello! Your verification code is {{code}}. Use it soon!',
        };

        sendEmailStub.resolves();

        await sendOTPEmail(ctx, 'user@example.com', '654321', config);

        // Verify fetch was not called
        assert(fetchStub.notCalled);

        // Verify sendEmail was called with replaced template
        assert(sendEmailStub.calledOnce);
        const [, , , , body] = sendEmailStub.firstCall.args;
        assert.strictEqual(body, 'Hello! Your verification code is 654321. Use it soon!');
      });

      it('should use DEFAULT_OTP_BODY_TEMPLATE when neither url nor template is set', async () => {
        const ctx = DEFAULT_CONTEXT({
          log: {
            info: sinon.stub(),
            warn: sinon.stub(),
            error: sinon.stub(),
          },
          requestInfo: {
            org: 'test-org',
            site: 'test-site',
          },
        });

        const config = {
          otpEmailSender: 'sender@test.com',
          // No otpEmailBodyUrl or otpEmailBodyTemplate
        };

        sendEmailStub.resolves();

        await sendOTPEmail(ctx, 'user@example.com', '999888', config);

        // Verify fetch was not called
        assert(fetchStub.notCalled);

        // Verify sendEmail was called with default template
        assert(sendEmailStub.calledOnce);
        const [, , , , body] = sendEmailStub.firstCall.args;
        assert(body.includes('999888'));
        assert(body.includes('Your login code is:'));
        assert(body.includes('This code will expire in 5 minutes'));
      });

      it('should prioritize otpEmailBodyUrl over otpEmailBodyTemplate', async () => {
        const ctx = DEFAULT_CONTEXT({
          log: {
            info: sinon.stub(),
            warn: sinon.stub(),
            error: sinon.stub(),
          },
          requestInfo: {
            org: 'test-org',
            site: 'test-site',
          },
        });

        const config = {
          otpEmailSender: 'sender@test.com',
          otpEmailBodyUrl: 'https://example.com/url-template.html',
          otpEmailBodyTemplate: 'Template string with {{code}}',
        };

        // Mock successful template fetch
        fetchStub.resolves({
          ok: true,
          status: 200,
          text: sinon.stub().resolves('URL template: {{code}}'),
        });

        sendEmailStub.resolves();

        await sendOTPEmail(ctx, 'user@example.com', '111222', config);

        // Verify fetch was called (url takes precedence)
        assert(fetchStub.calledOnce);

        // Verify the URL template was used, not the string template
        assert(sendEmailStub.calledOnce);
        const [, , , , body] = sendEmailStub.firstCall.args;
        assert.strictEqual(body, 'URL template: 111222');
      });
    });

    describe('email subject logic', () => {
      it('should use otpEmailSubject from config when available', async () => {
        const ctx = DEFAULT_CONTEXT({
          log: {
            info: sinon.stub(),
            warn: sinon.stub(),
            error: sinon.stub(),
          },
          requestInfo: {
            org: 'test-org',
            site: 'test-site',
          },
        });

        const config = {
          otpEmailSender: 'sender@test.com',
          otpEmailSubject: 'Custom Login Subject',
        };

        sendEmailStub.resolves();

        await sendOTPEmail(ctx, 'user@example.com', '123456', config);

        // Verify sendEmail was called with custom subject
        assert(sendEmailStub.calledOnce);
        const [, , , subject] = sendEmailStub.firstCall.args;
        assert.strictEqual(subject, 'Custom Login Subject');
      });

      it('should use OTP_SUBJECT default when otpEmailSubject is not set', async () => {
        const ctx = DEFAULT_CONTEXT({
          log: {
            info: sinon.stub(),
            warn: sinon.stub(),
            error: sinon.stub(),
          },
          requestInfo: {
            org: 'test-org',
            site: 'test-site',
          },
        });

        const config = {
          otpEmailSender: 'sender@test.com',
          // No otpEmailSubject
        };

        sendEmailStub.resolves();

        await sendOTPEmail(ctx, 'user@example.com', '123456', config);

        // Verify sendEmail was called with default subject
        assert(sendEmailStub.calledOnce);
        const [, , , subject] = sendEmailStub.firstCall.args;
        assert.strictEqual(subject, 'Your login code');
      });
    });

    describe('integration test - complete flow', () => {
      it('should send email with all parameters correctly assembled', async () => {
        const ctx = DEFAULT_CONTEXT({
          log: {
            info: sinon.stub(),
            warn: sinon.stub(),
            error: sinon.stub(),
          },
          requestInfo: {
            org: 'my-org',
            site: 'my-site',
          },
        });

        const config = {
          otpEmailSender: 'auth@mycompany.com',
          otpEmailSubject: 'Welcome! Your Code',
          otpEmailBodyTemplate: 'Hi! Code: {{code}}',
        };

        sendEmailStub.resolves();

        await sendOTPEmail(ctx, 'testuser@example.com', '555666', config);

        // Verify sendEmail was called with all correct parameters
        assert(sendEmailStub.calledOnce);
        const [ctxArg, fromEmail, toEmail, subject, body] = sendEmailStub.firstCall.args;

        assert.strictEqual(ctxArg, ctx);
        assert.strictEqual(fromEmail, 'auth@mycompany.com');
        assert.strictEqual(toEmail, 'testuser@example.com');
        assert.strictEqual(subject, 'Welcome! Your Code');
        assert.strictEqual(body, 'Hi! Code: 555666');
      });

      it('should handle sendEmail errors by propagating them', async () => {
        const ctx = DEFAULT_CONTEXT({
          log: {
            info: sinon.stub(),
            warn: sinon.stub(),
            error: sinon.stub(),
          },
          requestInfo: {
            org: 'test-org',
            site: 'test-site',
          },
        });

        const config = {
          otpEmailSender: 'sender@test.com',
        };

        // Mock sendEmail to throw
        const emailError = new Error('SMTP connection failed');
        sendEmailStub.rejects(emailError);

        let thrownError;
        try {
          await sendOTPEmail(ctx, 'user@example.com', '123456', config);
        } catch (err) {
          thrownError = err;
        }

        // Verify the error was propagated
        assert(thrownError);
        assert.strictEqual(thrownError, emailError);
      });
    });

    describe('edge cases', () => {
      it('should handle empty code string', async () => {
        const ctx = DEFAULT_CONTEXT({
          log: {
            info: sinon.stub(),
            warn: sinon.stub(),
            error: sinon.stub(),
          },
          requestInfo: {
            org: 'test-org',
            site: 'test-site',
          },
        });

        const config = {
          otpEmailSender: 'sender@test.com',
          otpEmailBodyTemplate: 'Code: {{code}}',
        };

        sendEmailStub.resolves();

        await sendOTPEmail(ctx, 'user@example.com', '', config);

        // Verify it still works with empty code
        assert(sendEmailStub.calledOnce);
        const [, , , , body] = sendEmailStub.firstCall.args;
        assert.strictEqual(body, 'Code: ');
      });

      it('should handle template with multiple {{code}} placeholders', async () => {
        const ctx = DEFAULT_CONTEXT({
          log: {
            info: sinon.stub(),
            warn: sinon.stub(),
            error: sinon.stub(),
          },
          requestInfo: {
            org: 'test-org',
            site: 'test-site',
          },
        });

        const config = {
          otpEmailSender: 'sender@test.com',
          otpEmailBodyTemplate: 'First: {{code}} and Second: {{code}}',
        };

        sendEmailStub.resolves();

        await sendOTPEmail(ctx, 'user@example.com', '777', config);

        assert(sendEmailStub.calledOnce);
        const [, , , , body] = sendEmailStub.firstCall.args;
        assert.strictEqual(body, 'First: 777 and Second: 777');
      });

      it('should handle template with no {{code}} placeholder', async () => {
        const ctx = DEFAULT_CONTEXT({
          log: {
            info: sinon.stub(),
            warn: sinon.stub(),
            error: sinon.stub(),
          },
          requestInfo: {
            org: 'test-org',
            site: 'test-site',
          },
        });

        const config = {
          otpEmailSender: 'sender@test.com',
          otpEmailBodyTemplate: 'This is a template with no placeholder',
        };

        sendEmailStub.resolves();

        await sendOTPEmail(ctx, 'user@example.com', '888', config);

        // Should send template as-is
        assert(sendEmailStub.calledOnce);
        const [, , , , body] = sendEmailStub.firstCall.args;
        assert.strictEqual(body, 'This is a template with no placeholder');
      });

      it('should handle undefined config properties gracefully', async () => {
        const ctx = DEFAULT_CONTEXT({
          log: {
            info: sinon.stub(),
            warn: sinon.stub(),
            error: sinon.stub(),
          },
          requestInfo: {
            org: 'test-org',
            site: 'test-site',
          },
          env: {
            FROM_EMAIL: 'default@test.com',
          },
        });

        const config = {
          otpEmailSender: undefined,
          otpEmailSubject: undefined,
          otpEmailBodyTemplate: undefined,
          otpEmailBodyUrl: undefined,
        };

        sendEmailStub.resolves();

        await sendOTPEmail(ctx, 'user@example.com', '999', config);

        // Should fall back to defaults
        assert(sendEmailStub.calledOnce);
        const [, fromEmail, , subject, body] = sendEmailStub.firstCall.args;
        assert.strictEqual(fromEmail, 'default@test.com');
        assert.strictEqual(subject, 'Your login code');
        assert(body.includes('999'));
        assert(body.includes('Your login code is:'));
      });
    });
  });
});
