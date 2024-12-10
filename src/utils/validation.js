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

/* eslint-disable no-underscore-dangle */

/** @typedef {import("./validation.d.js").AnySchema} AnySchema */
/** @typedef {import("./validation.d.js").SchemaType} SchemaType */
/** @typedef {import("./validation.d.js").BuiltinType} BuiltinType */
/** @typedef {import("./validation.d.js").Conditions} Conditions */
/** @typedef {import("./validation.d.js").UninvertedConditions} UninvertedConditions */
/** @typedef {import("./validation.d.js").ValidationError} ValidationError */

/** @type {Record<SchemaType, boolean>} */
const SCHEMA_DEF_TYPES = {
  number: true,
  integer: true,
  string: true,
  boolean: true,
  array: true,
  object: true,
  null: true,
};

const NO_DOT_NOTATION_REGEX = /^[^a-zA-Z_]|.*(\s)|.*[^a-zA-Z0-9_]/;

/**
 * @param {unknown} obj
 * @param {SchemaType} ptype
 * @param {string} path
 * @param {boolean} required
 * @param {boolean} nullable
 * @returns {ValidationError|undefined}
 */
const _validateType = (obj, ptype, path, required, nullable) => {
  if (!SCHEMA_DEF_TYPES[ptype]) {
    // eslint-disable-next-line no-console
    console.error('invalid schema, unexpected type: ', ptype, path);
    throw Error('invalid schema, unexpected type');
  }

  const actual = typeof obj;
  const error = (a = actual) => ({
    message: 'invalid type',
    details: `expected ${ptype}, got ${a}`,
    path,
  });

  if (!required && actual === 'undefined') return undefined;
  else if (actual === 'undefined') return error();
  else if ((nullable || ptype === 'null') && obj === null) return undefined;
  else if (obj === null) return error('null');
  else if (ptype === 'array') {
    if (!Array.isArray(obj)) return error();
  } else if (['number', 'integer'].includes(ptype)) {
    if (actual !== 'number' && actual !== 'bigint') return error();
    else if (ptype === 'integer' && !Number.isInteger(obj)) {
      return error('non-integer');
    }
  } else if (ptype !== actual) return error();
  return undefined;
};

/**
 * @template {keyof UninvertedConditions} T
 * @param {any} obj
 * @param {T} conditionType
 * @param {UninvertedConditions[T]} condition
 * @param {string} path
 * @param {ValidationError[]} errors
 * @returns {string|boolean|undefined} - error detail, error, no error
 */
const _checkCondition = (obj, conditionType, condition, path, errors) => {
  switch (conditionType) {
    case 'atLeastN': {
      const [required, conditions] = condition;
      let count = 0;
      const newErrs = [];
      conditions.find((one) => {
        // eslint-disable-next-line no-use-before-define
        const errs = checkConditions(obj, one, path);
        if (!errs.length) {
          count += 1;
        } else {
          newErrs.push(...errs);
        }
        return count >= required;
      });
      if (count < required) {
        errors.push(...newErrs);
        return `${count} conditions passed`;
      }
      return undefined;
    }
    case 'constant': {
      // TODO: deep equivalence if needed
      return JSON.stringify(obj) !== JSON.stringify(condition);
    }
    case 'enum': {
      let found;
      condition.find((one) => {
        found = _checkCondition(obj, 'constant', one, path, errors);
        return !found;
      });
      return found;
    }
    case 'pattern': {
      return !condition.test(obj);
    }
    default:
      // eslint-disable-next-line no-console
      console.error('invalid schema, unexpected condition encountered: ', conditionType, obj);
      throw Error('invalid schema, unexpected condition');
  }
};

/**
 * @template {keyof Conditions} T
 * @param {any} obj
 * @param {T} key
 * @param {Conditions[T]} condition
 * @param {string} path
 * @param {ValidationError[]} errors
 * @returns {boolean} - whether to stop validation, something failed
 */
const checkCondition = (obj, key, condition, path, errors) => {
  let invert = false;
  let type = key;
  if (type.startsWith('not.')) {
    type = type.substring('not.'.length);
    invert = true;
    // for atLeastN, it becomes atMostN
    // which is actually !(atLeastN-1)
    if (type === 'atLeastN') {
      // eslint-disable-next-line no-param-reassign
      condition[0] -= 1;
    }
  }
  const msg = _checkCondition(obj, type, condition, path, errors);
  let failed = !!msg;
  if (invert) failed = !failed;
  // add error
  if (failed) {
    errors.push({
      path,
      message: `condition '${key}' failed`,
      ...(typeof msg === 'string' ? { details: msg } : {}),
    });
  }
  return failed;
};

/**
 * @param {any} obj
 * @param {Conditions} conditions
 * @param {string} path
 * @returns {ValidationError[]}
 */
const checkConditions = (obj, conditions, path) => {
  const errors = [];

  Object.entries(conditions).find(([k, v]) => checkCondition(obj, k, v, path, errors));
  return errors;
};

/**
 * Make a property key for the error path,
 * using dot notation if possible
 *
 * @param {string} k
 */
const cleanPropertyPathKey = (k) => {
  if (NO_DOT_NOTATION_REGEX.test(k)) {
    return `['${k}']`;
  }
  return `.${k}`;
};

/**
 * @param {unknown} obj - to validate
 * @param {AnySchema} pschema - to match
 * @param {string} [ppath=''] - to report location of errors
 * @param {ValidationError[]} [errors=[]] - collection of errors
 * @param {boolean} [prequired=true]
 */
const _validate = (
  obj,
  pschema,
  ppath = '$',
  errors = [],
  prequired = true,
) => {
  if (pschema == null || typeof pschema !== 'object') {
    throw Error('invalid schema');
  }
  const { type, nullable, ...schema } = pschema;
  const typeErr = _validateType(obj, type, ppath, prequired, nullable);
  if (typeErr) {
    errors.push(typeErr);
    return errors;
  }

  // nothing more to do
  if (obj == null) return errors;

  /** @type {Conditions|undefined} */
  let conditions;

  /**
   * @param {string} path
   * @returns {(message: string, details?: string) => ValidationError[]}
   */
  const error = (path) => (message, details) => {
    errors.push({
      path,
      message,
      details,
    });
    return errors;
  };

  // for current level object
  const objErr = error(ppath);

  // check each type for it's uninvertible properties
  // whatever is leftover are the conditions
  switch (type) {
    case 'array': {
      const {
        items,
        minItems: min,
        maxItems: max,
        additionalItems,
        ...rest
      } = schema;
      conditions = rest;

      const count = obj.length;
      if (typeof min === 'number' && count < min) {
        return objErr(
          'invalid array length',
          `${count} items received, ${min} minimum`,
        );
      } else if (typeof max === 'number' && count > max) {
        return objErr(
          'invalid array length',
          `${count} items received, ${max} minimum`,
        );
      }

      const broke = !!obj.find((item, i) => {
        const path = `${ppath}[${i}]`;
        let itemSchema = items;
        if (Array.isArray(items)) {
          if (i >= items.length) {
            if (!additionalItems) {
              objErr(
                'additional items not allowed in tuple',
                `${items.length - (i - 1)} additional items`,
              );
              return true;
            }
            return false;
          } else {
            itemSchema = items[i];
          }
        }
        const prevErrs = errors.length;
        _validate(item, itemSchema, path, errors);
        // if an error was added, break early
        return errors.length > prevErrs;
      });

      if (broke) return errors;
      break;
    }
    case 'object': {
      const {
        properties,
        additionalProperties,
        minProperties: min,
        maxProperties: max,
        required = [],
        ...rest
      } = schema;
      conditions = rest;

      const count = Object.keys(obj).length;
      if (typeof min === 'number' && count < min) {
        return objErr(
          'invalid object size',
          `${count} properties received, ${min} minimum`,
        );
      } else if (typeof max === 'number' && count > max) {
        return objErr(
          'invalid object size',
          `${count} properties received, ${max} maximum`,
        );
      }

      const found = [];
      const broke = !!Object.entries(obj).find(([k, v]) => {
        const path = `${ppath}${cleanPropertyPathKey(k)}`;
        const err = error(path);
        let propSchema = properties[k];
        const propRequired = required.includes(k);
        if (propRequired) found.push(k);

        if (!propSchema && !additionalProperties) {
          return err(
            'additional properties not allowed in object',
            `unexpected key '${k}' encountered`,
          );
        } else if (!propSchema && typeof additionalProperties !== 'object') {
          return false;
        } else if (!propSchema) {
          propSchema = additionalProperties;
        }

        const prevErrs = errors.length;
        _validate(v, propSchema, path, errors, propRequired);
        // if an error was added, break early
        return errors.length > prevErrs;
      });

      if (broke) return errors;
      if (found.length < required.length) {
        // find missing required props
        const missing = required.filter((p) => !found.includes(p));
        return objErr('object missing required properties', `missing property keys: [${missing.map((k) => `'${k}'`).join(', ')}]`);
      }
      break;
    }
    case 'integer':
    case 'number': {
      const { min, max, ...rest } = schema;
      conditions = rest;

      if (typeof min === 'number' && obj < min) {
        return objErr('invalid number', `${obj} received, ${min} minimum`);
      } else if (typeof max === 'number' && obj > max) {
        return objErr('invalid number', `${obj} received, ${max} maximum`);
      }

      break;
    }
    case 'string': {
      const { minLength: min, maxLength: max, ...rest } = schema;
      conditions = rest;

      const len = obj.length;
      if (typeof min === 'number' && len < min) {
        return objErr(
          'invalid string length',
          `${len} characters received, ${min} minimum`,
        );
      } else if (typeof max === 'number' && obj.length > max) {
        return objErr(
          'invalid string length',
          `${len} characters received, ${max} maximum`,
        );
      }

      break;
    }
    case 'boolean':
    case 'null':
      conditions = schema;
      break;
    /* v8 ignore next 2 */
    default:
      break;
  }

  errors.push(...checkConditions(obj, conditions, ppath));
  return errors;
};

/**
 * Light validation by schema definition
 * @param {unknown} obj
 * @param {AnySchema} schema
 * @returns {ValidationError[]|undefined}
 */
export function validate(obj, schema) {
  const errs = _validate(obj, schema);
  return errs.length > 0 ? errs : undefined;
}
