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

  constructor(nameSelector) {
    this.#root = new Node('');
    this.#nameSelector = nameSelector;
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
