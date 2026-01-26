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

import assert from 'assert';
import { pruneUndefined as pruneUndef } from '../../src/utils/product.js';
import {
  validate,
  PATH_PATTERN,
  PATH_PATTERN_WITH_JSON,
  DIRECTORY_PATH_PATTERN,
} from '../../src/utils/validation.js';

function check(val, schema, expectedErrors) {
  const errs = validate(val, schema);
  if (!expectedErrors) {
    assert.ok(!errs);
  } else {
    assert.strictEqual(errs.length, expectedErrors.length);
    errs.forEach((pactual, i) => {
      const actual = { ...pactual };
      assert.deepStrictEqual(
        expectedErrors[i],
        pruneUndef({
          ...actual,
          ...{
            details: undefined,
          },
        }),
      );
    });
  }
}

function checkCases(cases, type) {
  cases.forEach(({ value, errors, schema = {} }, i) => {
    if (type && typeof schema.type === 'undefined') {
      schema.type = type;
    }
    it(`-> case ${i}`, () => {
      check(value, schema, errors);
    });
  });
}

describe('util', () => {
  describe('validate()', () => {
    /** @type {Console} */
    let ogConsole;
    before(() => {
      ogConsole = { ...console };
    });
    afterEach(() => {
      globalThis.console = ogConsole;
    });

    it('error cases', () => {
      // swallow expected error logs
      globalThis.console.error = () => {};

      assert.throws(() => validate({}, null), Error('invalid schema'));
      assert.throws(() => validate({}, undefined), Error('invalid schema'));
      assert.throws(() => validate({}, 1), Error('invalid schema'));
      assert.throws(() => validate({}, { type: 'badType' }), Error('invalid schema, unexpected type'));
      assert.throws(() => validate({}, { type: 'object', badProperty: 1 }), Error('invalid schema, unexpected condition'));
    });

    describe('integer', () => {
      /** @type {TestCase[]} */
      const cases = [
        // 0
        {
          value: 1,
        },
        // 1. float
        {
          value: 1.1,
          errors: [
            {
              message: 'invalid type',
              path: '$',
            },
          ],
        },
        // 2. null, nullable
        {
          value: null,
          schema: {
            nullable: true,
          },
        },
        // 3. null, not nullable
        {
          value: null,
          schema: {
            nullable: false,
          },
          errors: [
            {
              message: 'invalid type',
              path: '$',
            },
          ],
        },
        // 4. in range
        {
          value: 7,
          schema: {
            min: 1,
            max: 10,
          },
        },
        // 5. below range
        {
          value: 0,
          schema: {
            min: 1,
            max: 10,
          },
          errors: [
            {
              message: 'invalid number',
              path: '$',
            },
          ],
        },
        // 6. above range
        {
          value: 11,
          schema: {
            min: 1,
            max: 10,
          },
          errors: [
            {
              message: 'invalid number',
              path: '$',
            },
          ],
        },
        // 7. in enum values, in range
        {
          value: 1,
          schema: {
            min: 1,
            max: 10,
            enum: [1, 2, 3],
          },
        },
        // 8. at least N, valid
        {
          value: 1,
          schema: {
            atLeastN: [
              2,
              [
                {
                  constant: 1,
                },
                {
                  constant: 2,
                },
                {
                  enum: [1, 2],
                },
              ],
            ],
          },
        },
        // 9. at least N, invalid
        {
          value: 1,
          schema: {
            atLeastN: [
              2,
              [
                {
                  constant: 1,
                },
                {
                  constant: 2,
                },
                {
                  enum: [2, 3],
                },
              ],
            ],
          },
          errors: [
            { message: "condition 'constant' failed", path: '$' },
            { message: "condition 'enum' failed", path: '$' },
            { message: "condition 'atLeastN' failed", path: '$' },
          ],
        },
        // 10. inverted rules, valid
        {
          value: 1,
          schema: {
            'not.enum': [0, 2],
          },
        },
        // 11. inverted rules, invalid
        {
          value: 1,
          schema: {
            'not.enum': [0, 1, 2],
          },
          errors: [
            {
              message: "condition 'not.enum' failed",
              path: '$',
            },
          ],
        },
        // 12. inverted atLeastN
        {
          value: 1,
          schema: {
            'not.atLeastN': [
              2,
              [
                {
                  constant: 1,
                },
                {
                  constant: 2,
                },
                {
                  enum: [2, 3],
                },
              ],
            ],
          },
          errors: [
            {
              path: '$',
              message: "condition 'not.atLeastN' failed",
            },
          ],
        },
      ];
      checkCases(cases, 'integer');
    });

    describe('number', () => {
      const cases = [
        // 0. constant, valid
        {
          value: 3.14159,
          schema: {
            constant: 3.14159,
          },
        },
        // 1. constant, invalid
        {
          value: 2.71828,
          schema: {
            constant: 3.14159,
          },
          errors: [
            {
              message: "condition 'constant' failed",
              path: '$',
            },
          ],
        },
        // 2. bigint, valid
        {
          // eslint-disable-next-line no-undef
          value: BigInt(true),
        },
        // 3. invalid type
        {
          value: 'abc',
          errors: [{ message: 'invalid type', path: '$' }],
        },
      ];
      checkCases(cases, 'number');
    });

    describe('string', () => {
      const cases = [
        // 0
        {
          value: 'foo',
        },
        // 1. minLength, valid
        {
          value: 'foo',
          schema: {
            minLength: 3,
          },
        },
        // 2. minLength, invalid
        {
          value: 'foo',
          schema: {
            minLength: 4,
          },
          errors: [
            {
              message: 'invalid string length',
              path: '$',
            },
          ],
        },
        // 3. maxLength, valid
        {
          value: 'foo',
          schema: {
            maxLength: 3,
          },
        },
        // 4. maxLength, invalid
        {
          value: 'foo',
          schema: {
            maxLength: 2,
          },
          errors: [
            {
              message: 'invalid string length',
              path: '$',
            },
          ],
        },
        // 5. pattern, valid
        {
          value: 'foo',
          schema: {
            pattern: /^foo$/,
          },
        },
        // 6. pattern, invalid
        {
          value: 'foo2',
          schema: {
            pattern: /^foo$/,
          },
          errors: [
            {
              message: "condition 'pattern' failed",
              path: '$',
            },
          ],
        },
        // 7. inverse pattern, valid
        {
          value: 'foo2',
          schema: {
            'not.pattern': /^foo$/,
          },
        },
        // 8. inverse pattern, invalid
        {
          value: 'foo',
          schema: {
            'not.pattern': /^foo$/,
          },
          errors: [
            {
              message: "condition 'not.pattern' failed",
              path: '$',
            },
          ],
        },
      ];
      checkCases(cases, 'string');
    });

    describe('array', () => {
      const cases = [
        // 0
        {
          value: [1, 2, 3],
          schema: {
            items: {
              type: 'number',
            },
          },
        },
        // 1. invalid nth element
        {
          value: ['a', 'b', 3],
          schema: {
            items: {
              type: 'string',
            },
          },
          errors: [{
            message: 'invalid type',
            path: '$[2]',
          }],
        },
        // 2. length, valid
        {
          value: [1, 2, 3],
          schema: {
            items: {
              type: 'number',
            },
            minItems: 3,
            maxItems: 3,
          },
        },
        // 3. length, too many
        {
          value: [1, 2, 3],
          schema: {
            items: {
              type: 'number',
            },
            maxItems: 2,
          },
          errors: [{
            message: 'invalid array length',
            path: '$',
          }],
        },
        // 4. length, too few
        {
          value: [1, 2, 3],
          schema: {
            items: {
              type: 'number',
            },
            minItems: 4,
          },
          errors: [{
            message: 'invalid array length',
            path: '$',
          }],
        },
        // 5. check elements are validated as schemas
        {
          value: ['a', 'a', 'b'],
          schema: {
            items: {
              type: 'string',
              pattern: /a/,
            },
          },
          errors: [{
            message: "condition 'pattern' failed",
            path: '$[2]',
          }],
        },
        // 6. tuple, allow additional, valid
        {
          value: [1, 2, 3],
          schema: {
            items: [{ type: 'number' }, { type: 'number' }],
            additionalItems: true,
          },
        },
        // 7. tuple, disallow additional, invalid
        {
          value: [1, 2, 3],
          schema: {
            items: [{ type: 'number' }, { type: 'number' }],
            additionalItems: false,
          },
          errors: [{
            message: 'additional items not allowed in tuple',
            path: '$',
          }],
        },
        // 8. invalid type
        {
          value: 1,
          errors: [{ message: 'invalid type', path: '$' }],
        },
      ];
      checkCases(cases, 'array');
    });

    describe('boolean', () => {
      const cases = [
        // 0
        {
          value: true,
        },
        // 1
        {
          value: false,
        },
        // 2. null and nullable
        {
          value: null,
          schema: {
            nullable: true,
          },
        },
        // 3. invalid type
        {
          value: 1,
          errors: [{ message: 'invalid type', path: '$' }],
        },
      ];
      checkCases(cases, 'boolean');
    });

    describe('null', () => {
      const cases = [
        // 0
        {
          value: null,
        },
        // 1. invalid type
        {
          value: undefined,
          errors: [{ message: 'invalid type', path: '$' }],
        },
        // 2. invalid type
        {
          value: 1,
          errors: [{ message: 'invalid type', path: '$' }],
        },
      ];
      checkCases(cases, 'null');
    });

    describe('object', () => {
      const cases = [
        // 0
        {
          value: {},
          schema: {
            properties: {},
          },
        },
        // 1. allow additional props
        {
          value: { foo: true },
          schema: {
            properties: {},
            additionalProperties: true,
          },
        },
        // 2. disallow additional props
        {
          value: { foo: true },
          schema: {
            properties: {},
            additionalProperties: false,
          },
          errors: [{ message: 'additional properties not allowed in object', path: '$.foo' }],
        },
        // 3. limit property count, in range
        {
          value: { foo: true },
          schema: {
            properties: {},
            minProperties: 0,
            maxProperties: 2,
            additionalProperties: true,
          },
        },
        // 4. limit property count, above range
        {
          value: { foo: true, bar: 1 },
          schema: {
            properties: {},
            minProperties: 0,
            maxProperties: 1,
            additionalProperties: true,
          },
          errors: [{ message: 'invalid object size', path: '$' }],
        },
        // 5. limit property count, below range
        {
          value: { foo: true },
          schema: {
            properties: {},
            minProperties: 2,
            maxProperties: 3,
            additionalProperties: true,
          },
          errors: [{ message: 'invalid object size', path: '$' }],
        },
        // 6. invalid type
        {
          value: 1,
          errors: [{ message: 'invalid type', path: '$' }],
        },
        // 7. required properties, contains, valid
        {
          value: { foo: true },
          schema: {
            properties: {
              foo: {
                type: 'boolean',
              },
            },
            required: ['foo'],
          },
        },
        // 8. required properties, does not contain, valid
        {
          value: { foo: undefined },
          schema: {
            properties: {
              foo: {
                type: 'boolean',
              },
            },
          },
        },
        // 9. required properties, invalid
        {
          value: { },
          schema: {
            properties: {
              foo: {
                type: 'boolean',
              },
            },
            required: ['foo'],
          },
          errors: [{ message: 'object missing required properties', path: '$' }],
        },
        // 10. nullable properties
        {
          value: { foo: null },
          schema: {
            properties: {
              foo: {
                type: 'boolean',
                nullable: true,
              },
            },
            required: ['foo'],
          },
        },
        // 11. additional props with defined schema, fails
        {
          value: { foo: true },
          schema: {
            properties: {},
            additionalProperties: { type: 'string' },
          },
          errors: [{ message: 'invalid type', path: '$.foo' }],
        },
        // 12. additional props with defined schema, passes
        {
          value: { foo: 'str' },
          schema: {
            properties: {},
            additionalProperties: { type: 'string' },
          },
        },
      ];
      checkCases(cases, 'object');

      describe('any-of property schemas', () => {
        it('valid when matches first schema', () => {
          const schema = {
            type: 'object',
            properties: {
              a: [
                { type: 'string' },
                { type: 'number' },
              ],
            },
          };
          check({ a: 'x' }, schema);
        });

        it('valid when matches second schema', () => {
          const schema = {
            type: 'object',
            properties: {
              a: [
                { type: 'string' },
                { type: 'number' },
              ],
            },
          };
          check({ a: 42 }, schema);
        });

        it('invalid when matches none', () => {
          const schema = {
            type: 'object',
            properties: {
              a: [
                { type: 'string' },
                { type: 'number' },
              ],
            },
          };
          check({ a: true }, schema, [{ message: 'invalid type', path: '$.a' }]);
        });

        it('works with complex object candidate', () => {
          const schema = {
            type: 'object',
            properties: {
              a: [
                { type: 'string' },
                { type: 'object', properties: { z: { type: 'number' } }, required: ['z'] },
              ],
            },
          };
          check({ a: { z: 7 } }, schema);
        });

        it('reports error when complex candidate also fails', () => {
          const schema = {
            type: 'object',
            properties: {
              a: [
                { type: 'string' },
                { type: 'object', properties: { z: { type: 'number' } }, required: ['z'] },
              ],
            },
          };
          check({ a: {} }, schema, [{ message: 'invalid type', path: '$.a' }]);
        });
      });

      // special cases
      describe('special cases', () => {
        it('simple path keys, uses dot notation', () => {
          const [err] = validate({ foo: true }, { type: 'object', properties: { foo: { type: 'number' } } });
          assert.strictEqual(err.path, '$.foo');
        });

        it('simple path keys, nested', () => {
          const schema1 = { type: 'object', properties: { foo: { type: 'number' } } };
          const schema2 = { type: 'object', properties: { foo: schema1 } };
          const schema3 = { type: 'object', properties: { foo: schema2 } };
          const invalid = { foo: { foo: { foo: 'bad' } } };

          const [err] = validate(invalid, schema3);
          assert.strictEqual(err.path, '$.foo.foo.foo');
        });

        it('complex path keys, uses bracket notation', () => {
          const [err] = validate({ '1foo*cant be&variable': true }, { type: 'object', properties: { '1foo*cant be&variable': { type: 'number' } } });
          assert.strictEqual(err.path, '$[\'1foo*cant be&variable\']');
        });

        it('combined path keys, nested', () => {
          const schema1 = { type: 'object', properties: { root: { type: 'number' } } };
          const schema2 = { type: 'object', properties: { 'level 2': schema1 } };
          const schema3 = { type: 'object', properties: { foo: schema2 } };
          const invalid = { foo: { 'level 2': { root: 'bad' } } };

          const [err] = validate(invalid, schema3);
          assert.strictEqual(err.path, '$.foo[\'level 2\'].root');
        });
      });
    });
  });

  describe('Path Pattern Tests', () => {
    describe('PATH_PATTERN (no .json extension)', () => {
      describe('valid paths', () => {
        const validPaths = [
          '/products',
          '/products/123',
          '/products/test-product',
          '/products/test-product-123',
          '/us/en/products/test',
          '/us/en/products/electronics/blender-pro-500',
          '/emea/uk/en/products/category/subcategory/item',
          '/a',
          '/a/b',
          '/a/b/c/d/e/f/g/h',
          '/test-123',
          '/test-123-456',
          '/000',
          '/123abc',
          '/products-123/items-456/test-789',
          '/en/products/product-with-many-hyphens-in-name',
          '/ca/en_us/products/test',
          '/us/en_us/products/20-ounce-travel-cup',
          '/en_us/test',
          '/a_b/c_d/filename',
        ];

        validPaths.forEach((path) => {
          it(`should match valid path: ${path}`, () => {
            assert.ok(PATH_PATTERN.test(path), `Expected ${path} to match PATH_PATTERN`);
          });
        });
      });

      describe('invalid paths - security vulnerabilities', () => {
        const securityPaths = [
          { path: '/products/../admin', reason: 'directory traversal (..)' },
          { path: '/../etc/passwd', reason: 'directory traversal at start' },
          { path: '/products/../../etc/passwd', reason: 'multiple directory traversal' },
          { path: '/products/.', reason: 'current directory (.)' },
          { path: '/products/./test', reason: 'current directory in middle' },
          { path: '/products/...', reason: 'triple dots' },
        ];

        securityPaths.forEach(({ path, reason }) => {
          it(`should reject ${reason}: ${path}`, () => {
            assert.ok(!PATH_PATTERN.test(path), `Expected ${path} to be rejected`);
          });
        });
      });

      describe('invalid paths - malformed', () => {
        const malformedPaths = [
          { path: '/products//test', reason: 'double slashes' },
          { path: '//products', reason: 'double slashes at start' },
          { path: '/products/test//', reason: 'double slashes at end' },
          { path: 'products/test', reason: 'no leading slash' },
          { path: '/products/', reason: 'trailing slash' },
          { path: '/', reason: 'root only' },
          { path: '', reason: 'empty string' },
          { path: '/products test', reason: 'space in path' },
          { path: '/products\ttest', reason: 'tab in path' },
          { path: '/products\ntest', reason: 'newline in path' },
        ];

        malformedPaths.forEach(({ path, reason }) => {
          it(`should reject ${reason}: ${path}`, () => {
            assert.ok(!PATH_PATTERN.test(path), `Expected ${path} to be rejected`);
          });
        });
      });

      describe('invalid paths - character restrictions', () => {
        const invalidCharPaths = [
          { path: '/Products/Test', reason: 'uppercase letters' },
          { path: '/PRODUCTS', reason: 'all uppercase' },
          { path: '/products/Test', reason: 'mixed case' },
          { path: '/products/test_item', reason: 'underscore in filename' },
          { path: '/products/test.json', reason: '.json extension (not allowed without _WITH_JSON)' },
          { path: '/products/test.html', reason: '.html extension' },
          { path: '/products/test@123', reason: 'at sign' },
          { path: '/products/test#123', reason: 'hash' },
          { path: '/products/test%20item', reason: 'percent encoding' },
          { path: '/products/test&item', reason: 'ampersand' },
          { path: '/products/test+item', reason: 'plus sign' },
          { path: '/products/test=item', reason: 'equals sign' },
          { path: '/products/test?query', reason: 'question mark' },
          { path: '/products/test*', reason: 'asterisk' },
          { path: '/products/test|item', reason: 'pipe' },
          { path: '/products/test\\item', reason: 'backslash' },
          { path: '/products/test[0]', reason: 'square brackets' },
          { path: '/products/test{id}', reason: 'curly braces' },
          { path: '/products/test(1)', reason: 'parentheses' },
          { path: '/products/test,item', reason: 'comma' },
          { path: '/products/test;item', reason: 'semicolon' },
          { path: '/products/test:item', reason: 'colon' },
          { path: '/products/test\'item', reason: 'single quote' },
          { path: '/products/test"item', reason: 'double quote' },
          { path: '/products/test<item', reason: 'less than' },
          { path: '/products/test>item', reason: 'greater than' },
          { path: '/products/café', reason: 'non-ASCII characters (é)' },
          { path: '/products/测试', reason: 'non-ASCII characters (Chinese)' },
          { path: '/products/тест', reason: 'non-ASCII characters (Cyrillic)' },
          { path: '/products/🎉', reason: 'emoji' },
        ];

        invalidCharPaths.forEach(({ path, reason }) => {
          it(`should reject ${reason}: ${path}`, () => {
            assert.ok(!PATH_PATTERN.test(path), `Expected ${path} to be rejected`);
          });
        });
      });

      describe('edge cases - hyphen placement', () => {
        it('should reject path starting with hyphen', () => {
          assert.ok(!PATH_PATTERN.test('/-products'));
        });

        it('should reject path ending with hyphen', () => {
          assert.ok(!PATH_PATTERN.test('/products-'));
        });

        it('should reject segment starting with hyphen', () => {
          assert.ok(!PATH_PATTERN.test('/products/-test'));
        });

        it('should reject segment ending with hyphen', () => {
          assert.ok(!PATH_PATTERN.test('/products/test-'));
        });

        it('should reject double hyphens', () => {
          assert.ok(!PATH_PATTERN.test('/products/test--item'));
        });

        it('should accept single hyphen between alphanumerics', () => {
          assert.ok(PATH_PATTERN.test('/products/test-item'));
        });

        it('should accept multiple hyphens with alphanumerics between', () => {
          assert.ok(PATH_PATTERN.test('/products/test-item-123-abc'));
        });
      });

      describe('edge cases - underscore placement', () => {
        it('should allow underscores in directory segments', () => {
          assert.ok(PATH_PATTERN.test('/en_us/products/test'));
          assert.ok(PATH_PATTERN.test('/ca/en_us/test'));
          assert.ok(PATH_PATTERN.test('/a_b/c_d/filename'));
        });

        it('should reject underscores in filename (last segment)', () => {
          assert.ok(!PATH_PATTERN.test('/products/test_item'));
          assert.ok(!PATH_PATTERN.test('/test_file'));
          assert.ok(!PATH_PATTERN.test('/en_us/products/test_product'));
        });

        it('should accept hyphens in filename', () => {
          assert.ok(PATH_PATTERN.test('/ca/en_us/products/20-ounce-travel-cup'));
          assert.ok(PATH_PATTERN.test('/en_us/test-file'));
        });
      });
    });

    describe('PATH_PATTERN_WITH_JSON (optional .json extension)', () => {
      describe('valid paths with .json', () => {
        const validPaths = [
          '/products.json',
          '/products/123.json',
          '/products/test-product.json',
          '/us/en/products/test.json',
          '/us/en/products/electronics/blender-pro-500.json',
          '/a.json',
          '/test-123.json',
          '/ca/en_us/products/test.json',
          '/en_us/test-file.json',
        ];

        validPaths.forEach((path) => {
          it(`should match valid path with .json: ${path}`, () => {
            assert.ok(PATH_PATTERN_WITH_JSON.test(path), `Expected ${path} to match`);
          });
        });
      });

      describe('valid paths without .json', () => {
        const validPaths = [
          '/products',
          '/products/test-product',
          '/us/en/products/test',
          '/a',
          '/test-123',
          '/ca/en_us/products/test',
          '/en_us/test-file',
        ];

        validPaths.forEach((path) => {
          it(`should match valid path without .json: ${path}`, () => {
            assert.ok(PATH_PATTERN_WITH_JSON.test(path), `Expected ${path} to match`);
          });
        });
      });

      describe('invalid paths with .json', () => {
        const invalidPaths = [
          { path: '/products/../admin.json', reason: 'directory traversal with .json' },
          { path: '/Products/Test.json', reason: 'uppercase with .json' },
          { path: '/products//test.json', reason: 'double slashes with .json' },
          { path: 'products/test.json', reason: 'no leading slash with .json' },
          { path: '/products/.json', reason: 'dot segment with .json' },
          { path: '/products/test .json', reason: 'space before .json' },
        ];

        invalidPaths.forEach(({ path, reason }) => {
          it(`should reject ${reason}: ${path}`, () => {
            assert.ok(!PATH_PATTERN_WITH_JSON.test(path), `Expected ${path} to be rejected`);
          });
        });
      });

      describe('other extensions should not match', () => {
        const invalidExtensions = [
          '/products/test.html',
          '/products/test.xml',
          '/products/test.txt',
          '/products/test.pdf',
          '/products/test.js',
          '/products/test.css',
          '/products/test.jpeg',
          '/products/test.jsonl',
          '/products/test.jsn',
        ];

        invalidExtensions.forEach((path) => {
          it(`should reject non-.json extension: ${path}`, () => {
            assert.ok(!PATH_PATTERN_WITH_JSON.test(path), `Expected ${path} to be rejected`);
          });
        });
      });

      describe('comparison with PATH_PATTERN', () => {
        it('PATH_PATTERN should reject .json paths', () => {
          const pathsWithJson = [
            '/products/test.json',
            '/us/en/products/test.json',
            '/test.json',
          ];

          pathsWithJson.forEach((path) => {
            assert.ok(!PATH_PATTERN.test(path), `PATH_PATTERN should reject ${path}`);
          });
        });

        it('both patterns should accept paths without .json', () => {
          const pathsWithoutJson = [
            '/products/test',
            '/us/en/products/test',
            '/test',
          ];

          pathsWithoutJson.forEach((path) => {
            assert.ok(PATH_PATTERN.test(path), `PATH_PATTERN should accept ${path}`);
            assert.ok(PATH_PATTERN_WITH_JSON.test(path), `PATH_PATTERN_WITH_JSON should accept ${path}`);
          });
        });

        it('both patterns should reject invalid paths', () => {
          const invalidPaths = [
            '/products/../admin',
            '/Products/Test',
            '/products//test',
            'products/test',
            '/products/.',
          ];

          invalidPaths.forEach((path) => {
            assert.ok(!PATH_PATTERN.test(path), `PATH_PATTERN should reject ${path}`);
            assert.ok(!PATH_PATTERN_WITH_JSON.test(path), `PATH_PATTERN_WITH_JSON should reject ${path}`);
          });
        });
      });
    });

    describe('DIRECTORY_PATH_PATTERN (for index paths)', () => {
      describe('valid directory paths', () => {
        const validPaths = [
          '/ca',
          '/en_us',
          '/ca/en_us',
          '/us/en_us/products',
          '/a_b/c_d/e_f',
          '/products',
          '/products/category',
        ];

        validPaths.forEach((path) => {
          it(`should match valid directory path: ${path}`, () => {
            assert.ok(DIRECTORY_PATH_PATTERN.test(path), `Expected ${path} to match`);
          });
        });
      });

      describe('invalid directory paths', () => {
        const invalidPaths = [
          { path: '/products/../admin', reason: 'directory traversal' },
          { path: '/Products/Test', reason: 'uppercase letters' },
          { path: '/products//test', reason: 'double slashes' },
          { path: 'products/test', reason: 'no leading slash' },
          { path: '/products/', reason: 'trailing slash' },
          { path: '/', reason: 'root only' },
          { path: '', reason: 'empty string' },
          { path: '/products_', reason: 'trailing underscore' },
          { path: '/products__test', reason: 'double underscores' },
        ];

        invalidPaths.forEach(({ path, reason }) => {
          it(`should reject ${reason}: ${path}`, () => {
            assert.ok(!DIRECTORY_PATH_PATTERN.test(path), `Expected ${path} to be rejected`);
          });
        });
      });

      describe('comparison with PATH_PATTERN', () => {
        it('DIRECTORY_PATH_PATTERN should accept paths with underscores in last segment', () => {
          // These are valid directory paths but invalid file paths
          assert.ok(DIRECTORY_PATH_PATTERN.test('/en_us'), 'DIRECTORY_PATH_PATTERN should accept /en_us');
          assert.ok(DIRECTORY_PATH_PATTERN.test('/ca/en_us'), 'DIRECTORY_PATH_PATTERN should accept /ca/en_us');
          assert.ok(!PATH_PATTERN.test('/en_us'), 'PATH_PATTERN should reject /en_us (underscore in filename)');
          assert.ok(!PATH_PATTERN.test('/ca/en_us'), 'PATH_PATTERN should reject /ca/en_us (underscore in filename)');
        });

        it('both patterns should accept paths without underscores in last segment', () => {
          const paths = ['/products', '/ca/products', '/us/en/products'];
          paths.forEach((path) => {
            assert.ok(DIRECTORY_PATH_PATTERN.test(path), `DIRECTORY_PATH_PATTERN should accept ${path}`);
            assert.ok(PATH_PATTERN.test(path), `PATH_PATTERN should accept ${path}`);
          });
        });
      });
    });
  });
});
