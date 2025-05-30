/*
 * Copyright 2024 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

/** @type {import("../utils/validation.js").AnySchema} */
const AttributeOverrides = {
  type: 'object',
  properties: {
    product: {
      type: 'object',
      properties: {},
      additionalProperties: { type: 'string' },
    },
    variant: {
      type: 'object',
      properties: {},
      additionalProperties: { type: 'string' },
    },
  },
};

/** @type {import("../utils/validation.js").AnySchema} */
const ConfigEntry = {
  type: 'object',
  properties: {
    apiKey: { type: 'string' },
    magentoEnvironmentId: { type: 'string' },
    magentoWebsiteCode: { type: 'string' },
    storeCode: { type: 'string' },
    coreEndpoint: { type: 'string' },
    catalogEndpoint: { type: 'string' },
    storeViewCode: { type: 'string' },
    siteOverridesKey: { type: 'string' },
    host: { type: 'string' },
    helixApiKey: { type: 'string' },
    offerVariantURLTemplate: { type: 'string' },
    liveSearchEnabled: { type: 'boolean' },
    attributeOverrides: AttributeOverrides,
    catalogSource: { type: 'string', enum: ['helix', 'magento'] },
    imageRoleOrder: {
      type: 'array',
      items: { type: 'string' },
    },
    imageParams: {
      type: 'object',
      properties: {},
      additionalProperties: { type: 'string' },
    },
    pageType: {
      type: 'string',
      enum: ['product'],
    },
    headers: {
      type: 'object',
      properties: {},
      additionalProperties: { type: 'string' },
    },
    imageRoles: {
      type: 'array',
      items: { type: 'string' },
    },
    variantAttributes: {
      type: 'array',
      items: { type: 'string' },
    },
    media: {
      type: 'object',
      properties: {
        prefix: { type: 'string' },
      },
    },
  },
};

/** @type {import("../utils/validation.js").AnySchema} */
const Config = {
  type: 'object',
  properties: {
    base: ConfigEntry,
  },
  additionalProperties: ConfigEntry,
  required: [
    'base',
  ],
};

export default Config;
