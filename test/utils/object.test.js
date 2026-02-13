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

import assert from 'node:assert';
import { deepEqual } from '../../src/utils/object.js';

describe('Object Utils', () => {
  describe('deepEqual', () => {
    // --- Primitives ---

    it('should return true for identical strings', () => {
      assert.strictEqual(deepEqual('hello', 'hello'), true);
    });

    it('should return false for different strings', () => {
      assert.strictEqual(deepEqual('hello', 'world'), false);
    });

    it('should return true for identical numbers', () => {
      assert.strictEqual(deepEqual(42, 42), true);
    });

    it('should return false for different numbers', () => {
      assert.strictEqual(deepEqual(42, 43), false);
    });

    it('should return true for identical booleans', () => {
      assert.strictEqual(deepEqual(true, true), true);
      assert.strictEqual(deepEqual(false, false), true);
    });

    it('should return false for different booleans', () => {
      assert.strictEqual(deepEqual(true, false), false);
    });

    it('should return true for both null', () => {
      assert.strictEqual(deepEqual(null, null), true);
    });

    it('should return true for both undefined', () => {
      assert.strictEqual(deepEqual(undefined, undefined), true);
    });

    it('should return false for null vs undefined', () => {
      assert.strictEqual(deepEqual(null, undefined), false);
      assert.strictEqual(deepEqual(undefined, null), false);
    });

    it('should return false for null vs object', () => {
      assert.strictEqual(deepEqual(null, {}), false);
      assert.strictEqual(deepEqual({}, null), false);
    });

    it('should return false for number vs string of same value', () => {
      assert.strictEqual(deepEqual(1, '1'), false);
    });

    it('should return true for zero and zero', () => {
      assert.strictEqual(deepEqual(0, 0), true);
    });

    it('should return true for empty string and empty string', () => {
      assert.strictEqual(deepEqual('', ''), true);
    });

    it('should return false for 0 vs false', () => {
      assert.strictEqual(deepEqual(0, false), false);
    });

    it('should return false for empty string vs false', () => {
      assert.strictEqual(deepEqual('', false), false);
    });

    // --- Plain objects ---

    it('should return true for empty objects', () => {
      assert.strictEqual(deepEqual({}, {}), true);
    });

    it('should return true for identical flat objects', () => {
      assert.strictEqual(deepEqual({ a: 1, b: 'two' }, { a: 1, b: 'two' }), true);
    });

    it('should return false when objects have different keys', () => {
      assert.strictEqual(deepEqual({ a: 1 }, { b: 1 }), false);
    });

    it('should return false when objects have different values', () => {
      assert.strictEqual(deepEqual({ a: 1 }, { a: 2 }), false);
    });

    it('should return false when objects have different key counts', () => {
      assert.strictEqual(deepEqual({ a: 1 }, { a: 1, b: 2 }), false);
    });

    it('should return true for the same object reference', () => {
      const obj = { a: 1 };
      assert.strictEqual(deepEqual(obj, obj), true);
    });

    // --- Nested objects ---

    it('should return true for identical nested objects', () => {
      const a = { x: { y: { z: 'deep' } } };
      const b = { x: { y: { z: 'deep' } } };
      assert.strictEqual(deepEqual(a, b), true);
    });

    it('should return false for nested objects with different leaf values', () => {
      const a = { x: { y: { z: 'deep' } } };
      const b = { x: { y: { z: 'different' } } };
      assert.strictEqual(deepEqual(a, b), false);
    });

    it('should return false for nested objects with different structure', () => {
      const a = { x: { y: 1 } };
      const b = { x: { z: 1 } };
      assert.strictEqual(deepEqual(a, b), false);
    });

    // --- Arrays ---

    it('should return true for empty arrays', () => {
      assert.strictEqual(deepEqual([], []), true);
    });

    it('should return true for identical arrays of primitives', () => {
      assert.strictEqual(deepEqual([1, 2, 3], [1, 2, 3]), true);
    });

    it('should return false for arrays with different values', () => {
      assert.strictEqual(deepEqual([1, 2, 3], [1, 2, 4]), false);
    });

    it('should return false for arrays with different lengths', () => {
      assert.strictEqual(deepEqual([1, 2], [1, 2, 3]), false);
    });

    it('should return false for arrays with same values in different order', () => {
      assert.strictEqual(deepEqual([1, 2, 3], [3, 2, 1]), false);
    });

    it('should return true for arrays with mixed primitive types', () => {
      assert.strictEqual(deepEqual(['bar', null, 123], ['bar', null, 123]), true);
    });

    it('should return false for arrays with mixed types differing at one position', () => {
      assert.strictEqual(deepEqual(['bar', null, 123], ['bar', undefined, 123]), false);
    });

    // --- Arrays vs objects ---

    it('should return false for empty array vs empty object', () => {
      assert.strictEqual(deepEqual([], {}), false);
    });

    it('should return false for array vs object with same indexed keys', () => {
      assert.strictEqual(deepEqual([1, 2], { 0: 1, 1: 2 }), false);
    });

    it('should return false for null vs array', () => {
      assert.strictEqual(deepEqual(null, []), false);
      assert.strictEqual(deepEqual([], null), false);
    });

    // --- Nested arrays ---

    it('should return true for identical nested arrays', () => {
      assert.strictEqual(deepEqual([[1, 2], [3, 4]], [[1, 2], [3, 4]]), true);
    });

    it('should return false for nested arrays with different inner values', () => {
      assert.strictEqual(deepEqual([[1, 2], [3, 4]], [[1, 2], [3, 5]]), false);
    });

    it('should return false for nested array vs flat array', () => {
      assert.strictEqual(deepEqual([[1, 2]], [1, 2]), false);
    });

    // --- Objects in arrays ---

    it('should return true for identical objects within arrays', () => {
      const a = [{ id: 1, name: 'a' }, { id: 2, name: 'b' }];
      const b = [{ id: 1, name: 'a' }, { id: 2, name: 'b' }];
      assert.strictEqual(deepEqual(a, b), true);
    });

    it('should return false for objects within arrays with different values', () => {
      const a = [{ id: 1, name: 'a' }];
      const b = [{ id: 1, name: 'different' }];
      assert.strictEqual(deepEqual(a, b), false);
    });

    it('should return true for empty objects within arrays', () => {
      assert.strictEqual(deepEqual([{}], [{}]), true);
    });

    it('should return false for empty object in array vs non-empty object', () => {
      assert.strictEqual(deepEqual([{}], [{ a: 1 }]), false);
    });

    // --- Arrays in objects ---

    it('should return true for identical arrays within objects', () => {
      const a = { tags: ['red', 'blue'], counts: [1, 2, 3] };
      const b = { tags: ['red', 'blue'], counts: [1, 2, 3] };
      assert.strictEqual(deepEqual(a, b), true);
    });

    it('should return false for arrays within objects with different values', () => {
      const a = { tags: ['red', 'blue'] };
      const b = { tags: ['red', 'green'] };
      assert.strictEqual(deepEqual(a, b), false);
    });

    // --- Complex mixed structures ---

    it('should return true for deeply nested mixed structures', () => {
      const a = {
        custom: { foo: [{}, 'bar', null, 123] },
        meta: { nested: { arr: [{ x: [1, 2] }] } },
      };
      const b = {
        custom: { foo: [{}, 'bar', null, 123] },
        meta: { nested: { arr: [{ x: [1, 2] }] } },
      };
      assert.strictEqual(deepEqual(a, b), true);
    });

    it('should return false for deeply nested mixed structures with one difference', () => {
      const a = {
        custom: { foo: [{}, 'bar', null, 123] },
        meta: { nested: { arr: [{ x: [1, 2] }] } },
      };
      const b = {
        custom: { foo: [{}, 'bar', null, 123] },
        meta: { nested: { arr: [{ x: [1, 3] }] } },
      };
      assert.strictEqual(deepEqual(a, b), false);
    });

    it('should return false when array element changes from object to primitive', () => {
      assert.strictEqual(deepEqual([{}, 'bar'], ['not-obj', 'bar']), false);
    });

    it('should return false when array element changes from null to object', () => {
      assert.strictEqual(deepEqual([null, 1], [{}, 1]), false);
    });

    it('should return false when object property changes from array to object', () => {
      assert.strictEqual(deepEqual({ a: [1] }, { a: { 0: 1 } }), false);
    });
  });
});
