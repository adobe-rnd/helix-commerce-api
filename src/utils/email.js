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

import { Resend } from 'resend';
import { errorWithResponse } from './http.js';

/**
 * Normalize email address (lowercase, trim)
 *
 * @param {string} email
 * @returns {string}
 */
export function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

/**
 * Validate email format
 *
 * @param {string} email
 * @returns {boolean}
 */
export function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Send an email using Resend
 *
 * @param {Context} ctx
 * @param {string} recipientEmail
 * @param {string} subject
 * @param {string} body html
 */
export async function sendEmail(ctx, recipientEmail, subject, body) {
  const { env } = ctx;
  if (!env.RESEND_API_KEY) {
    ctx.log.error('RESEND_API_KEY is not set');
    throw errorWithResponse(500, 'internal server error');
  }

  // ctx.log.debug('sending email to', recipientEmail, env.RESEND_API_KEY);
  const resend = new Resend(env.RESEND_API_KEY);
  const resp = await resend.emails.send({
    // from: 'noreply@adobecommerce.live',
    from: env.FROM_EMAIL || 'onboarding@resend.dev',
    to: recipientEmail,
    subject,
    html: body,
  });
  if (resp.error) {
    ctx.log.error('error sending email', recipientEmail, resp.error);
    throw errorWithResponse(500, 'internal server error');
  }
}
