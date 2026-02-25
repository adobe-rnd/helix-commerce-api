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

// eslint-disable-next-line import/no-extraneous-dependencies
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
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
 * Send an email
 *
 * @param {Context} ctx
 * @param {string} fromEmail
 * @param {string} toEmail
 * @param {string} subject
 * @param {string} body html
 */
export async function sendEmail(ctx, fromEmail, toEmail, subject, body) {
  const { env, log, requestInfo } = ctx;
  const { org, site } = requestInfo;

  if (!env.AWS_SES_SECRET_ACCESS_KEY
    || !env.AWS_SES_ACCESS_KEY_ID
    || !env.AWS_SES_ACCOUNT_ID) {
    log.error('AWS_SES_SECRET_ACCESS_KEY, AWS_SES_ACCESS_KEY_ID, or AWS_SES_ACCOUNT_ID is not set');
    throw errorWithResponse(500, 'internal server error');
  }

  const client = new SESv2Client({
    region: env.AWS_SES_REGION || 'us-east-1',
    credentials: {
      secretAccessKey: env.AWS_SES_SECRET_ACCESS_KEY,
      accessKeyId: env.AWS_SES_ACCESS_KEY_ID,
      accountId: env.AWS_SES_ACCOUNT_ID,
    },
  });

  try {
    const resp = await client.send(new SendEmailCommand({
      FromEmailAddress: fromEmail,
      Destination: {
        ToAddresses: [toEmail],
      },
      Content: {
        Simple: {
          Subject: {
            Data: subject,
          },
          Body: {
            Html: {
              Data: body,
            },
          },
        },
      },
    }));
    log.info(`[SES] email sent for ${org}/${site}`, resp.$metadata.httpStatusCode, resp.MessageId);
  } catch (error) {
    log.error(`[SES] error sending email for ${org}/${site}`, error);
    throw errorWithResponse(500, 'internal server error');
  }
}
