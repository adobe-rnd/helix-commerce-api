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

import assert from 'node:assert';
import { DEFAULT_CONTEXT } from '../../fixtures/context.js';
import { JSONTemplate } from '../../../src/templates/json/JSONTemplate.js';

describe('JSONTemplate', () => {
  describe('#constructProductURL()', () => {
    const configWithOfferVariantURLTemplate = {
      host: 'https://www.example.com',
      matchedPatterns: ['/products/{{urlkey}}/{{sku}}'],
      configMap: {
        '/products/{{urlkey}}/{{sku}}': {
          offerVariantURLTemplate: '/products/{{urlkey}}?selected_product={{sku}}',
        },
      },
    };

    const configWithoutOfferVariantURLTemplate = {
      host: 'https://www.example.com',
      matchedPatterns: ['/products/{{urlkey}}/{{sku}}'],
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
      const template = new JSONTemplate(DEFAULT_CONTEXT({
        // @ts-ignore
        config: configWithoutOfferVariantURLTemplate,
      // @ts-ignore
      }), product1, []);
      const url = template.constructProductURL();
      const expectedUrl = 'https://www.example.com/products/utopia-small-pendant/kw5531';
      assert.strictEqual(url, expectedUrl, 'Product URL without variant does not match expected URL');
    });

    it('should construct the correct variant URL without offerVariantURLTemplate', () => {
      const template = new JSONTemplate(DEFAULT_CONTEXT({
        // @ts-ignore
        config: configWithoutOfferVariantURLTemplate,
      // @ts-ignore
      }), product1, [variant1]);

      // @ts-ignore
      const url = template.constructProductURL(variant1);
      const expectedUrl = 'https://www.example.com/products/utopia-small-pendant/kw5531/?optionsUIDs=Y29uZmlndXJhYmxlLzE2NTEvODI3MQ%3D%3D';
      assert.strictEqual(url, expectedUrl, 'Variant URL without offerVariantURLTemplate does not match expected URL');
    });

    // Test Case 4: Encode special characters in sku and urlKey
    it('should correctly encode special characters in sku and urlKey', () => {
      const template = new JSONTemplate(DEFAULT_CONTEXT({
        // @ts-ignore
        config: configWithoutOfferVariantURLTemplate,
      // @ts-ignore
      }), productWithSpecialCharacters, []);

      const url = template.constructProductURL();
      const expectedUrl = 'https://www.example.com/products/summer-sun/kw%2055%2F31';
      assert.strictEqual(url, expectedUrl, 'URL with special characters does not match expected URL');
    });

    it('should correctly encode special characters in variant sku and selections', () => {
      const template = new JSONTemplate(DEFAULT_CONTEXT({
        // @ts-ignore
        config: configWithoutOfferVariantURLTemplate,
      // @ts-ignore
      }), productWithSpecialCharacters, [variantWithSpecialSelections]);

      // @ts-ignore
      const url = template.constructProductURL(variantWithSpecialSelections);
      const expectedUrl = 'https://www.example.com/products/summer-sun/kw%2055%2F31/?optionsUIDs=Y29uZmlndXJhYmxlLzE2NTEvODI3MQ%3D%3D%2CY29uZmlndXJhYmxlLzI0NjEvMzYzNDE%3D';
      assert.strictEqual(url, expectedUrl, 'Variant URL with special characters does not match expected URL');
    });

    it('should handle variant with empty selections', () => {
      const variantEmptySelections = {
        sku: 'VAR-EMPTY',
        selections: [],
      };

      const template = new JSONTemplate(DEFAULT_CONTEXT({
        // @ts-ignore
        config: configWithoutOfferVariantURLTemplate,
      // @ts-ignore
      }), product1, [variantEmptySelections]);
      // @ts-ignore
      const url = template.constructProductURL(variantEmptySelections);
      const expectedUrl = 'https://www.example.com/products/utopia-small-pendant/kw5531/?optionsUIDs=';
      assert.strictEqual(url, expectedUrl, 'URL with empty variant selections does not match expected URL');
    });

    it('should construct the correct URL when variant is undefined', () => {
      const template = new JSONTemplate(DEFAULT_CONTEXT({
        // @ts-ignore
        config: configWithOfferVariantURLTemplate,
      // @ts-ignore
      }), product1, []);
      const url = template.constructProductURL();
      const expectedUrl = 'https://www.example.com/products/utopia-small-pendant/kw5531';
      assert.strictEqual(url, expectedUrl, 'Product URL with undefined variant does not match expected URL');
    });

    it('should correctly replace multiple placeholders in matchedPath', () => {
      const configMultiplePlaceholders = {
        host: 'https://www.example.com',
        matchedPatterns: ['/shop/{{urlkey}}/{{sku}}/details'],
      };
      const product = {
        urlKey: 'modern-lamp',
        sku: 'ML-2023',
      };
      const template = new JSONTemplate(DEFAULT_CONTEXT({
        // @ts-ignore
        config: configMultiplePlaceholders,
      // @ts-ignore
      }), product, []);
      const url = template.constructProductURL();
      const expectedUrl = 'https://www.example.com/shop/modern-lamp/ml-2023/details';
      assert.strictEqual(url, expectedUrl, 'URL with multiple placeholders does not match expected URL');
    });
  });
});
