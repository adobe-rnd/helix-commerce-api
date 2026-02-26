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

import { errorResponse } from '../../utils/http.js';
import { sendEmail, isValidEmail, normalizeEmail } from '../../utils/email.js';
import { fetchProductBusConfig } from '../../utils/config.js';

const DEFAULT_FROM_EMAIL = 'noreply@adobecommerce.live';
const MAX_RECIPIENTS = 50;
const MAX_HTML_SIZE = 256 * 1024; // 256 KB

/**
 * Normalize and validate a list of emails.
 * Returns { emails, error } where error is a string if invalid.
 *
 * @param {string|string[]} input
 * @param {string} fieldName
 * @returns {{ emails: string[], error: string|null }}
 */
function normalizeEmailList(input, fieldName) {
  const arr = Array.isArray(input) ? input : [input];
  const emails = [];
  for (const email of arr) {
    if (typeof email !== 'string') {
      return { emails: [], error: `${fieldName} contains non-string value` };
    }
    const normalized = normalizeEmail(email);
    if (!isValidEmail(normalized)) {
      return { emails: [], error: `invalid email in ${fieldName}: ${email}` };
    }
    emails.push(normalized);
  }
  return { emails, error: null };
}

/**
 * Handle email sending request
 *
 * POST /:org/sites/:site/emails
 *
 * @type {RouteHandler}
 */
export default async function handler(ctx) {
  const { data, requestInfo, authInfo } = ctx;
  const { org, site, method } = requestInfo;

  if (method !== 'POST') {
    return errorResponse(405, 'method not allowed');
  }

  authInfo.assertAuthenticated();
  authInfo.assertPermissions('emails:send');
  authInfo.assertOrgSite(org, site);
  // validate payload
  const {
    html, subject, toEmail, cc, bcc,
  } = data;

  if (!html || typeof html !== 'string') {
    return errorResponse(400, 'html is required and must be a string');
  }

  if (html.length > MAX_HTML_SIZE) {
    return errorResponse(400, `html exceeds maximum size of ${MAX_HTML_SIZE} bytes`);
  }

  if (!subject || typeof subject !== 'string') {
    return errorResponse(400, 'subject is required and must be a string');
  }

  if (!toEmail) {
    return errorResponse(400, 'toEmail is required');
  }

  // normalize and validate recipients
  const to = normalizeEmailList(toEmail, 'toEmail');
  if (to.error) {
    return errorResponse(400, to.error);
  }

  let ccEmails = [];
  if (cc !== undefined) {
    if (!Array.isArray(cc)) {
      return errorResponse(400, 'cc must be an array');
    }
    const ccResult = normalizeEmailList(cc, 'cc');
    if (ccResult.error) {
      return errorResponse(400, ccResult.error);
    }
    ccEmails = ccResult.emails;
  }

  let bccEmails = [];
  if (bcc !== undefined) {
    if (!Array.isArray(bcc)) {
      return errorResponse(400, 'bcc must be an array');
    }
    const bccResult = normalizeEmailList(bcc, 'bcc');
    if (bccResult.error) {
      return errorResponse(400, bccResult.error);
    }
    bccEmails = bccResult.emails;
  }

  const totalRecipients = to.emails.length + ccEmails.length + bccEmails.length;
  if (totalRecipients > MAX_RECIPIENTS) {
    return errorResponse(400, `total recipients exceeds maximum of ${MAX_RECIPIENTS}`);
  }

  // check email scope for all destination addresses
  const allAddresses = [...to.emails, ...ccEmails, ...bccEmails];
  authInfo.assertEmailScope(allAddresses);

  // determine fromEmail from site config
  const config = await fetchProductBusConfig(ctx);
  const fromEmail = config?.otpEmailSender || ctx.env.FROM_EMAIL || DEFAULT_FROM_EMAIL;

  await sendEmail(ctx, fromEmail, to.emails, subject, html, {
    cc: ccEmails.length ? ccEmails : undefined,
    bcc: bccEmails.length ? bccEmails : undefined,
  });

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
