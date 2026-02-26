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

import assert from 'node:assert';
import handlers from '../../src/routes/index.js';

describe('routes/index', () => {
  it('should export all route handlers', () => {
    assert(handlers.catalog, 'catalog handler should be exported');
    assert(handlers.auth, 'auth handler should be exported');
    assert(handlers.orders, 'orders handler should be exported');
    assert(handlers.customers, 'customers handler should be exported');
    assert(handlers['operations-log'], 'operations-log handler should be exported');
    assert(handlers.cache, 'cache handler should be exported');
    assert(handlers.indices, 'indices handler should be exported');
    assert(handlers.config, 'config handler should be exported');
    assert(handlers.emails, 'emails handler should be exported');
  });

  it('should export correct number of handlers', () => {
    const handlerKeys = Object.keys(handlers);
    assert.strictEqual(handlerKeys.length, 9);
  });

  it('should have handlers as functions', () => {
    assert.strictEqual(typeof handlers.catalog, 'function');
    assert.strictEqual(typeof handlers.auth, 'function');
    assert.strictEqual(typeof handlers.orders, 'function');
    assert.strictEqual(typeof handlers.customers, 'function');
    assert.strictEqual(typeof handlers['operations-log'], 'function');
    assert.strictEqual(typeof handlers.cache, 'function');
    assert.strictEqual(typeof handlers.indices, 'function');
    assert.strictEqual(typeof handlers.config, 'function');
    assert.strictEqual(typeof handlers.emails, 'function');
  });
});
