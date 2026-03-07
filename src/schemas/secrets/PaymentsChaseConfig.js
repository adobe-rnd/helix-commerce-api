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

/** @type {import("../../utils/validation.js").ObjectSchema} */
const PaymentsChaseConfig = {
  type: 'object',
  properties: {
    enabled: { type: 'boolean' },
    title: { type: 'string', maxLength: 255 },
    username: { type: 'string', minLength: 1, maxLength: 255 },
    password: { type: 'string', minLength: 1, maxLength: 1024 },
    hostedSecureId: { type: 'string', minLength: 1, maxLength: 255 },
    hostedSecureApiToken: { type: 'string', minLength: 1, maxLength: 1024 },
    merchantId: { type: 'string', minLength: 1, maxLength: 255 },
    terminalId: { type: 'string', minLength: 1, maxLength: 255 },
    bin: { type: 'string', minLength: 1, maxLength: 255 },
    safetechMerchantId: { type: 'string', minLength: 1, maxLength: 255 },
    initUrl: { type: 'string', minLength: 1, maxLength: 2048 },
    redirectUrl: { type: 'string', minLength: 1, maxLength: 2048 },
    serviceUrl: { type: 'string', minLength: 1, maxLength: 2048 },
    avsUrl: { type: 'string', minLength: 1, maxLength: 2048 },
    templateUrl: { type: 'string', minLength: 1, maxLength: 2048 },
    maxRetries: { type: 'number', min: 0, max: 10 },
    creditCardTypes: {
      type: 'array',
      items: { type: 'string', enum: ['Visa', 'MasterCard', 'American Express', 'Discover', 'JCB', 'Diners Club'] },
    },
    language: { type: 'string', maxLength: 10 },
    successUrl: { type: 'string', minLength: 1, maxLength: 2048 },
    cancelUrl: { type: 'string', minLength: 1, maxLength: 2048 },
  },
  required: [
    'username',
    'password',
    'hostedSecureId',
    'hostedSecureApiToken',
    'merchantId',
    'terminalId',
    'bin',
    'initUrl',
    'redirectUrl',
    'serviceUrl',
    'successUrl',
    'cancelUrl',
  ],
  additionalProperties: false,
};

export default PaymentsChaseConfig;
