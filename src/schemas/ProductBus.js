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

const MAX_JSON_LD_LENGTH = 128_000;

/** @type {import("../utils/validation.js").ObjectSchema} */
const CustomObject = {
  type: 'object',
  properties: {},
  additionalProperties: true,
};

/** @type {import("../utils/validation.js").StringSchema} */
const SchemaOrgAvailability = {
  type: 'string',
  enum: [
    'BackOrder',
    'Discontinued',
    'InStock',
    'InStoreOnly',
    'LimitedAvailability',
    'MadeToOrder',
    'OnlineOnly',
    'OutOfStock',
    'PreOrder',
    'PreSale',
    'Reserved',
    'SoldOut',
  ],
};

/** @type {import("../utils/validation.js").StringSchema} */
const SchemaOrgItemCondition = {
  type: 'string',
  enum: [
    'DamagedCondition',
    'NewCondition',
    'RefurbishedCondition',
    'UsedCondition',
  ],
};

/** @type {import("../utils/validation.js").ObjectSchema} */
export const ProductBusPrice = {
  type: 'object',
  properties: {
    currency: { type: 'string' },
    regular: { type: 'string' },
    final: { type: 'string' },
  },
};

/** @type {import("../utils/validation.js").ObjectSchema} */
const ProductBusMedia = {
  type: 'object',
  properties: {
    url: { type: 'string' },
    label: { type: 'string' },
    roles: { type: 'array', items: { type: 'string' } },
    video: { type: 'string' },
  },
  required: ['url'],
};

/** @type {import("../utils/validation.js").ObjectSchema} */
const ProductBusOptionValue = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    value: { type: 'string' },
    uid: { type: 'string' },
  },
  required: ['value'],
};

/** @type {import("../utils/validation.js").ObjectSchema} */
const ProductBusOption = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    label: { type: 'string' },
    position: { type: 'number' },
    values: {
      type: 'array',
      items: ProductBusOptionValue,
    },
  },
  required: ['label', 'values'],
};

/** @type {import("../utils/validation.js").ObjectSchema} */
const ProductBusVariant = {
  type: 'object',
  properties: {
    sku: { type: 'string' },
    name: { type: 'string' },
    price: ProductBusPrice,
    url: { type: 'string' },
    images: {
      type: 'array',
      items: ProductBusMedia,
    },
    gtin: { type: 'string' },
    description: { type: 'string' },
    availability: SchemaOrgAvailability,
    options: {
      type: 'array',
      items: ProductBusOptionValue,
    },
    itemCondition: SchemaOrgItemCondition,
    custom: CustomObject,
  },
  required: ['sku', 'name', 'url', 'images'],
};

/** @type {import("../utils/validation.js").ObjectSchema} */
const MerchantFeedShipping = {
  type: 'object',
  properties: {
    country: { type: 'string' },
    region: { type: 'string' },
    service: { type: 'string' },
    price: { type: 'string' },
    min_handling_time: { type: 'string' },
    max_handling_time: { type: 'string' },
    min_transit_time: { type: 'string' },
    max_transit_time: { type: 'string' },
  },
};

/** @type {import("../utils/validation.js").AnySchema} */
const ProductBusEntry = {
  type: 'object',
  properties: {
    sku: { type: 'string' },
    path: {
      type: 'string',
      pattern: /^\/[a-z0-9]+(-[a-z0-9]+)*(\/[a-z0-9]+(-[a-z0-9]+)*)*$/,
      maxLength: 900,
    },
    urlKey: { type: 'string', 'not.pattern': /^[A-Z\s]+$/ },
    description: { type: 'string' },
    name: { type: 'string' },
    metaTitle: { type: 'string' },
    metaDescription: { type: 'string' },
    gtin: { type: 'string' },
    url: { type: 'string' },
    brand: { type: 'string' },
    type: { type: 'string' },
    availability: SchemaOrgAvailability,
    price: ProductBusPrice,
    itemCondition: SchemaOrgItemCondition,
    metadata: {
      type: 'object',
      properties: {},
      additionalProperties: { type: 'string' },
    },
    options: {
      type: 'array',
      items: ProductBusOption,
    },
    aggregateRating: {
      type: 'object',
      properties: {
        ratingValue: { type: 'string' },
        reviewCount: { type: 'string' }, // converts to integer in JSON-LD
        bestRating: { type: 'string' },
        worstRating: { type: 'string' },
      },
    },
    specifications: { type: 'string' },
    images: {
      type: 'array',
      items: ProductBusMedia,
    },
    variants: {
      type: 'array',
      items: ProductBusVariant,
    },
    jsonld: {
      type: 'string',
      maxLength: MAX_JSON_LD_LENGTH,
    },
    custom: CustomObject,
    shipping: [
      { type: 'string' },
      MerchantFeedShipping,
      { type: 'array', items: MerchantFeedShipping },
    ],
  },
  required: ['sku', 'name', 'path'],
};

export default ProductBusEntry;
