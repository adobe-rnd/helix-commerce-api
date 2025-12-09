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
import { Node } from './node.js';

/**
 * Default name selector for routes.
 * Extracts literal segments (non-variable, non-wildcard) and joins them with hyphens.
 * Special handling: removes 'sites' prefix if it's the first literal and other literals exist.
 *
 * @param {string[]} segs - Route segments
 * @returns {string} Route name
 *
 * @example
 * nameSelector([':org', 'sites', ':site', 'catalog']) // => 'catalog'
 * nameSelector(['catalog', 'products']) // => 'catalog-products'
 * nameSelector([':org', ':site', ':id']) // => 'org'
 */
export const nameSelector = (segs) => {
  const literals = segs.filter((seg) => seg !== '*' && !seg.startsWith(':'));
  if (literals.length === 0) {
    return 'org';
  }
  // @ts-ignore
  if (literals.at(0) === 'sites' && literals.length > 1) {
    literals.shift();
  }
  return literals.join('-');
};

/**
 * Router that will match an incoming request to a handler.
 */
export default class Router {
  /**
   * Root node.
   */
  #root;

  /**
   * Name selector callback
   */
  #nameSelector;

  /**
   * Routes
   */
  #routes;

  constructor(selector) {
    this.#root = new Node('');
    this.#nameSelector = selector;
    this.#routes = new Map();
  }

  /**
   * Add a new route for a given expression.
   *
   * @param {string} expr expression
   * @param {function} handler handler
   */
  add(expr, handler) {
    const segs = expr.split('/').slice(1);

    const name = this.#nameSelector(segs);
    const route = this.#root.add(segs, { name, handler });
    this.#routes.set(name, route);

    return this;
  }

  /**
   * Find handler that should handle a request.
   *
   * @param {string} path path to match
   * @returns {object} containing `handler` and `variables` or `null`
   * @throws {StatusCodeError} if we're unable to find a matching handler
   */
  match(path) {
    const segs = path.split('/').slice(1);

    const variables = new Map();
    const match = this.#root.match(segs, variables);

    const { route } = match ?? {};
    if (route) {
      const { name, handler } = route;
      variables.set('route', name);
      return { handler, variables: Object.fromEntries(variables) };
    }
    return null;
  }

  /**
   * Returns the external path for a route with some variables
   * to fill in the variable segments traversing.
   *
   * @param {string} name route name
   * @param {Object<string, string>} variables variables
   * @returns {string} external path
   */
  external(name, variables) {
    /** @type {Node} */
    const route = this.#routes.get(name);
    if (!route) {
      throw new Error(`route not found: ${name}`);
    }
    const segs = [];
    route.external(segs, variables);
    return segs.join('/');
  }
}
