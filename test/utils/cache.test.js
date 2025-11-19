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

// @ts-nocheck

import assert from 'node:assert';
import { DEFAULT_CONTEXT } from '../fixtures/context.js';
import { assertRequiredProperties, nextRequestId } from '../../src/utils/cache.js';

describe('Cache Utility Functions', () => {
  describe('assertRequiredProperties', () => {
    it('should not throw when all required properties are present and truthy', () => {
      // Object with all required properties
      const obj = {
        host: 'example.com',
        token: 'abc123',
        serviceId: 'service1',
      };

      // Should not throw
      assert.doesNotThrow(() => {
        assertRequiredProperties(obj, 'test message', 'host', 'token', 'serviceId');
      });
    });

    it('should throw error when a required property is missing', () => {
      // Object missing 'token' property
      const obj = {
        host: 'example.com',
        serviceId: 'service1',
      };

      // Should throw with error message including property name
      assert.throws(() => {
        assertRequiredProperties(obj, 'config validation failed', 'host', 'token', 'serviceId');
      }, /config validation failed: "token" is required/);
    });

    it('should throw error when a required property is null', () => {
      // Object with null property
      const obj = {
        host: 'example.com',
        token: null,
        serviceId: 'service1',
      };

      // Should throw for null value
      assert.throws(() => {
        assertRequiredProperties(obj, 'invalid config', 'host', 'token', 'serviceId');
      }, /invalid config: "token" is required/);
    });

    it('should throw error when a required property is undefined', () => {
      // Object with undefined property
      const obj = {
        host: 'example.com',
        token: undefined,
        serviceId: 'service1',
      };

      // Should throw for undefined value
      assert.throws(() => {
        assertRequiredProperties(obj, 'missing property', 'host', 'token', 'serviceId');
      }, /missing property: "token" is required/);
    });

    it('should throw error when a required property is empty string', () => {
      // Object with empty string
      const obj = {
        host: 'example.com',
        token: '',
        serviceId: 'service1',
      };

      // Should throw for empty string
      assert.throws(() => {
        assertRequiredProperties(obj, 'empty value', 'host', 'token', 'serviceId');
      }, /empty value: "token" is required/);
    });

    it('should throw error when a required property is false', () => {
      // Object with false boolean
      const obj = {
        host: 'example.com',
        enabled: false,
      };

      // Should throw for false value
      assert.throws(() => {
        assertRequiredProperties(obj, 'config error', 'host', 'enabled');
      }, /config error: "enabled" is required/);
    });

    it('should throw error when a required property is 0', () => {
      // Object with 0 value
      const obj = {
        host: 'example.com',
        port: 0,
      };

      // Should throw for 0 value
      assert.throws(() => {
        assertRequiredProperties(obj, 'invalid value', 'host', 'port');
      }, /invalid value: "port" is required/);
    });

    it('should accept true boolean as valid', () => {
      // Object with true boolean
      const obj = {
        host: 'example.com',
        enabled: true,
      };

      // Should not throw for true value
      assert.doesNotThrow(() => {
        assertRequiredProperties(obj, 'test', 'host', 'enabled');
      });
    });

    it('should accept non-zero numbers as valid', () => {
      // Object with non-zero number
      const obj = {
        host: 'example.com',
        port: 8080,
      };

      // Should not throw for non-zero number
      assert.doesNotThrow(() => {
        assertRequiredProperties(obj, 'test', 'host', 'port');
      });
    });

    it('should throw for first missing property when multiple are missing', () => {
      // Object missing multiple properties
      const obj = {
        host: 'example.com',
      };

      // Should throw for the first missing property encountered
      assert.throws(() => {
        assertRequiredProperties(obj, 'multiple missing', 'host', 'token', 'serviceId');
      }, /multiple missing: "token" is required/);
    });

    it('should handle no required properties (empty check)', () => {
      const obj = { host: 'example.com' };

      // Should not throw when no properties are required
      assert.doesNotThrow(() => {
        assertRequiredProperties(obj, 'test');
      });
    });
  });

  describe('nextRequestId', () => {
    it('should initialize subRequestId to 1 on first call', () => {
      // Context without subRequestId
      const ctx = DEFAULT_CONTEXT({
        attributes: {},
      });

      const id = nextRequestId(ctx);

      // Should return 1 and set it in context
      assert.strictEqual(id, 1);
      assert.strictEqual(ctx.attributes.subRequestId, 1);
    });

    it('should increment subRequestId on subsequent calls', () => {
      // Context with existing subRequestId
      const ctx = DEFAULT_CONTEXT({
        attributes: {
          subRequestId: 5,
        },
      });

      const id = nextRequestId(ctx);

      // Should increment from 5 to 6
      assert.strictEqual(id, 6);
      assert.strictEqual(ctx.attributes.subRequestId, 6);
    });

    it('should generate sequential IDs for multiple calls', () => {
      const ctx = DEFAULT_CONTEXT({
        attributes: {},
      });

      // Call multiple times
      const id1 = nextRequestId(ctx);
      const id2 = nextRequestId(ctx);
      const id3 = nextRequestId(ctx);

      // Should be sequential
      assert.strictEqual(id1, 1);
      assert.strictEqual(id2, 2);
      assert.strictEqual(id3, 3);
    });

    it('should handle starting from 0', () => {
      const ctx = DEFAULT_CONTEXT({
        attributes: {
          subRequestId: 0,
        },
      });

      const id = nextRequestId(ctx);

      // Should increment from 0 to 1
      assert.strictEqual(id, 1);
    });
  });
});
