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

export type FilterPrefixedKeys<TObj, TPrefix extends string> = {
  [K in keyof TObj as K extends `${TPrefix}${infer I}` ? never : K]: TObj[K]
}

export type PrefixKeys<TObj, TPrefix extends string> = {
  [K in keyof TObj as K extends string ? `${TPrefix}${K}` : never]: TObj[K]
}

/**
 * AJV-like schema, with a slimmed down set of features
 * 
 * AJV is >110kb and has many features we don't need on the edge, 
 * since the backend APIs should be validating the data too.
 */

type InvertKey = 'not.';

type Uninvertable = 'type' | 'properties' | 'items' | 'additionalItems' | 'minItems' | 'maxItems' | 'min' | 'max' |
  'required' | 'additionalProperties' | 'minProperties' | 'maxProperties' | 'minLength' | 'maxLength' | 'nullable';

type InvertConditions<
  T,
  TUninvertible extends keyof Omit<T, 'type'> = never
> = PrefixKeys<Omit<FilterPrefixedKeys<T, InvertKey>, Uninvertable | TUninvertible>, InvertKey> & T;

export type BuiltinType = "string" | "number" | "bigint" | "boolean" | "symbol" | "undefined" | "object" | "function";

export type SchemaType = 'number' | 'integer' | 'string' | 'boolean' | 'array' | 'object' | 'null';

type AtLeastN = [n: number, conditions: Conditions[]];

interface _BaseSchema {
  type: SchemaType;
  enum?: any[];
  constant?: any;
  nullable?: boolean;
  atLeastN?: AtLeastN;
}

type BaseSchema = InvertConditions<_BaseSchema>;

interface _AnyNumberSchema extends BaseSchema {
  min?: number;
  max?: number;
}
type AnyNumberSchema = InvertConditions<_AnyNumberSchema>;

interface _StringSchema extends BaseSchema {
  type: "string";
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
}
export type StringSchema = InvertConditions<_StringSchema>;

export interface BooleanSchema extends BaseSchema {
  type: "boolean";
}

export interface NullSchema extends BaseSchema {
  type: "null";
}

export interface IntegerSchema extends AnyNumberSchema {
  type: "integer";
}

export interface NumberSchema extends AnyNumberSchema {
  type: "number";
}

type PropertySchema = InvertConditions<AnySchema & { matches?: string }>;

export interface ObjectSchema extends BaseSchema {
  type: "object";
  /**
   * Property definitions. A property may specify a single schema or an array of schemas,
   * which will be interpreted as "any of these schemas is valid".
   */
  properties: Record<string, PropertySchema | PropertySchema[]>;
  required?: string[];
  /** defaults to false */
  additionalProperties?: boolean | PropertySchema;
  minProperties?: number;
  maxProperties?: number;
}

export interface ArraySchema extends BaseSchema {
  items: AnySchema | AnySchema[];
  additionalItems?: boolean;
  minItems?: number;
  maxItems?: number;
}

export type PrimitiveSchema = IntegerSchema | IntegerSchema | NumberSchema | StringSchema | BooleanSchema | NullSchema;

export type AnySchema = PrimitiveSchema | ObjectSchema | ArraySchema;

export type Conditions<TSchema extends AnySchema = AnySchema> = Omit<TSchema, Uninvertable>;

export type UninvertedConditions<TSchema extends AnySchema = AnySchema> = FilterPrefixedKeys<Conditions<TSchema>, InvertKey>;

export interface ValidationError {
  path: string;
  message: string;
  details?: string;
}

export declare function validate(obj: unknown, schema: AnySchema): ValidationError[] | undefined;