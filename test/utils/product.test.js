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

// @ts-nocheck
/* eslint-disable max-len */

import assert from 'node:assert';
import { constructProductUrl } from '../../src/utils/product.js';

describe('constructProductUrl', () => {
  const configWithOfferVariantURLTemplate = {
    host: 'https://www.example.com',
    matchedPath: '/products/{{urlkey}}/{{sku}}',
    matchedPathConfig: {
      offerVariantURLTemplate: '/products/{{urlkey}}?selected_product={{sku}}',
    },
  };

  const configWithoutOfferVariantURLTemplate = {
    host: 'https://www.example.com',
    matchedPath: '/products/{{urlkey}}/{{sku}}',
  };

  const product1 = {
    urlKey: 'utopia-small-pendant',
    sku: 'KW5531',
  };

  const productWithSpecialCharacters = {
    urlKey: 'summer-sun',
    sku: 'KW 55/31',
  };

  const variant1 = {
    sku: 'VAR 001',
    selections: ['Y29uZmlndXJhYmxlLzE2NTEvODI3MQ=='],
  };

  const variantWithSpecialSelections = {
    sku: 'VAR-002',
    selections: ['Y29uZmlndXJhYmxlLzE2NTEvODI3MQ==', 'Y29uZmlndXJhYmxlLzI0NjEvMzYzNDE='],
  };

  it('should construct the correct product URL without variant', () => {
    const url = constructProductUrl(configWithoutOfferVariantURLTemplate, product1);
    const expectedUrl = 'https://www.example.com/products/utopia-small-pendant/KW5531';
    assert.strictEqual(url, expectedUrl, 'Product URL without variant does not match expected URL');
  });

  // Test Case 2: Construct URL with variant and offerVariantURLTemplate
  it('should construct the correct variant URL with offerVariantURLTemplate', () => {
    const url = constructProductUrl(configWithOfferVariantURLTemplate, product1, variant1);
    const expectedUrl = 'https://www.example.com/products/utopia-small-pendant?selected_product=VAR%20001';
    assert.strictEqual(url, expectedUrl, 'Variant URL with offerVariantURLTemplate does not match expected URL');
  });

  it('should construct the correct variant URL without offerVariantURLTemplate', () => {
    const url = constructProductUrl(configWithoutOfferVariantURLTemplate, product1, variant1);
    const expectedUrl = 'https://www.example.com/products/utopia-small-pendant/KW5531/?optionsUIDs=Y29uZmlndXJhYmxlLzE2NTEvODI3MQ==';
    assert.strictEqual(url, expectedUrl, 'Variant URL without offerVariantURLTemplate does not match expected URL');
  });

  // Test Case 4: Encode special characters in sku and urlKey
  it('should correctly encode special characters in sku and urlKey', () => {
    const url = constructProductUrl(configWithoutOfferVariantURLTemplate, productWithSpecialCharacters);
    const expectedUrl = 'https://www.example.com/products/summer-sun/KW%2055%2F31';
    assert.strictEqual(url, expectedUrl, 'URL with special characters does not match expected URL');
  });

  it('should correctly encode special characters in variant sku and selections', () => {
    const url = constructProductUrl(configWithoutOfferVariantURLTemplate, productWithSpecialCharacters, variantWithSpecialSelections);
    const expectedUrl = 'https://www.example.com/products/summer-sun/KW%2055%2F31/?optionsUIDs=Y29uZmlndXJhYmxlLzE2NTEvODI3MQ==%3D%2CY29uZmlndXJhYmxlLzI0NjEvMzYzNDE=';
    assert.strictEqual(url, expectedUrl, 'Variant URL with special characters does not match expected URL');
  });

  it('should handle variant with empty selections', () => {
    const variantEmptySelections = {
      sku: 'VAR-EMPTY',
      selections: [],
    };
    const url = constructProductUrl(configWithoutOfferVariantURLTemplate, product1, variantEmptySelections);
    const expectedUrl = 'https://www.example.com/products/utopia-small-pendant/KW5531/?optionsUIDs=';
    assert.strictEqual(url, expectedUrl, 'URL with empty variant selections does not match expected URL');
  });

  it('should handle missing matchedPathConfig when variant is present', () => {
    const url = constructProductUrl(configWithoutOfferVariantURLTemplate, product1, variant1);
    const expectedUrl = 'https://www.example.com/products/utopia-small-pendant/KW5531/?optionsUIDs=Y29uZmlndXJhYmxlLzE2NTEvODI3MQ==';
    assert.strictEqual(url, expectedUrl, 'URL without offerVariantURLTemplate but with variant does not match expected URL');
  });

  it('should construct the correct URL when variant is undefined', () => {
    const url = constructProductUrl(configWithOfferVariantURLTemplate, product1);
    const expectedUrl = 'https://www.example.com/products/utopia-small-pendant/KW5531';
    assert.strictEqual(url, expectedUrl, 'Product URL with undefined variant does not match expected URL');
  });

  it('should correctly replace multiple placeholders in matchedPath', () => {
    const configMultiplePlaceholders = {
      host: 'https://www.example.com',
      matchedPath: '/shop/{{urlkey}}/{{sku}}/details',
    };
    const product = {
      urlKey: 'modern-lamp',
      sku: 'ML-2023',
    };
    const url = constructProductUrl(configMultiplePlaceholders, product);
    const expectedUrl = 'https://www.example.com/shop/modern-lamp/ML-2023/details';
    assert.strictEqual(url, expectedUrl, 'URL with multiple placeholders does not match expected URL');
  });

  it('should handle empty offerVariantURLTemplate by falling back to optionsUIDs', () => {
    const configEmptyOfferVariantURLTemplate = {
      host: 'https://www.example.com',
      matchedPath: '/products/{{urlkey}}-{{sku}}',
      matchedPathConfig: {
        offerVariantURLTemplate: '',
      },
    };
    const url = constructProductUrl(configEmptyOfferVariantURLTemplate, product1, variant1);
    const expectedUrl = 'https://www.example.com/products/utopia-small-pendant-KW5531/?optionsUIDs=Y29uZmlndXJhYmxlLzE2NTEvODI3MQ==';
    assert.strictEqual(url, expectedUrl, 'URL with empty offerVariantURLTemplate does not match expected URL');
  });
});
