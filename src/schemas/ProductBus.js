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

/** @type {import("../utils/validation.js").ObjectSchema} */
const ProductBusPrice = {
  type: 'object',
  properties: {
    currency: { type: 'string' },
    regular: { type: 'number' },
    final: { type: 'number' },
  },
};

/** @type {import("../utils/validation.js").ObjectSchema} */
const ProductBusImage = {
  type: 'object',
  properties: {
    url: { type: 'string' },
    label: { type: 'string' },
    roles: { type: 'array', items: { type: 'string' } },
  },
  required: ['url'],
};

/** @type {import("../utils/validation.js").ObjectSchema} */
const ProductBusVariant = {
  type: 'object',
  properties: {
    sku: { type: 'string' },
    title: { type: 'string' },
    price: ProductBusPrice,
    url: { type: 'string' },
    image: { type: 'string' },
    gtin: { type: 'string' },
    availability: SchemaOrgAvailability,
  },
  required: ['sku', 'title', 'url', 'image', 'availability'],
};

/** @type {import("../utils/validation.js").AnySchema} */
const ProductBusEntry = {
  type: 'object',
  properties: {
    sku: { type: 'string', 'not.pattern': /^[A-Z\s]+$/ },
    urlKey: { type: 'string' },
    description: { type: 'string' },
    title: { type: 'string' },
    metaTitle: { type: 'string' },
    metaDescription: { type: 'string' },
    url: { type: 'string' },
    brand: { type: 'string' },
    availability: SchemaOrgAvailability,
    price: ProductBusPrice,
    aggregateRating: {
      type: 'object',
      properties: {
        ratingValue: { type: 'number' },
        reviewCount: { type: 'number' },
        bestRating: { type: 'number' },
        worstRating: { type: 'number' },
      },
    },
    images: {
      type: 'array',
      items: ProductBusImage,
    },
    variants: {
      type: 'array',
      items: ProductBusVariant,
    },
    jsonld: {
      type: 'string',
      maxLength: MAX_JSON_LD_LENGTH,
    },
    custom: {
      type: 'object',
      properties: {},
      additionalProperties: true,
    },
  },
  required: ['sku', 'urlKey', 'title'],
};

export default ProductBusEntry;
