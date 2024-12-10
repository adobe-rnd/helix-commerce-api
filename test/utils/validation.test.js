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
import { validate } from '../../src/utils/validation.js';

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
});
