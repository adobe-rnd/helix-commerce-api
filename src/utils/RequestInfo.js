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

/* eslint-disable max-classes-per-file */

/**
 * Class containing decomposed path information from router.
 * @implements {PathInfo}
 */
class PathInfo {
  #route;

  #org;

  #site;

  #path;

  #variables;

  /**
   * @param {string} route
   * @param {string} org
   * @param {string} site
   * @param {string} path
   * @param {Record<string, string>} variables
   */
  constructor(route, org, site, path, variables) {
    this.#route = route;
    this.#org = org;
    this.#site = site;
    this.#path = path;
    this.#variables = variables;
  }

  get route() {
    return this.#route;
  }

  get org() {
    return this.#org;
  }

  get site() {
    return this.#site;
  }

  get path() {
    return this.#path;
  }

  get siteKey() {
    return `${this.#org}--${this.#site}`;
  }

  get variables() {
    return this.#variables;
  }

  get email() {
    return this.getVariable('email');
  }

  get orderId() {
    return this.getVariable('orderId');
  }

  /**
   * Get a specific variable from the router match.
   * @param {string} name - Variable name
   * @returns {string|undefined}
   */
  getVariable(name) {
    return this.#variables[name];
  }
}

/**
 * Class containing HTTP request information.
 * @implements {HttpRequest}
 */
class HttpRequest {
  #method;

  #headers;

  #url;

  /**
   * @param {import('@cloudflare/workers-types').Request} request
   */
  constructor(request) {
    this.#method = request.method.toUpperCase();
    this.#headers = Object.fromEntries(
      [...request.headers.entries()].map(([k, v]) => [k.toLowerCase(), v]),
    );
    this.#url = new URL(request.url);
  }

  get method() {
    return this.#method;
  }

  /**
   * Headers as a plain object with lowercase keys.
   * @returns {Record<string, string>}
   */
  get headers() {
    return this.#headers;
  }

  get url() {
    return this.#url;
  }

  get scheme() {
    return this.#url.protocol.slice(0, -1);
  }

  get host() {
    return this.#url.host;
  }

  get pathname() {
    return this.#url.pathname;
  }

  get filename() {
    return this.#url.pathname.split('/').pop() ?? '';
  }

  get extension() {
    return this.filename.split('.').pop();
  }

  /**
   * Get a header value.
   * @param {string} name - Header name
   * @returns {string|undefined}
   */
  getHeader(name) {
    return this.#headers[name.toLowerCase()];
  }
}

/**
 * Class containing the aspects of both HTTP request and decomposed path.
 * @implements {RequestInfo}
 */
export class RequestInfo {
  #request;

  #pathInfo;

  /**
   * @param {HttpRequest} request
   * @param {PathInfo} pathInfo
   */
  constructor(request, pathInfo) {
    this.#request = request;
    this.#pathInfo = pathInfo;
  }

  // HTTP Request properties
  get method() {
    return this.#request.method;
  }

  /** @returns {Record<string, string>} */
  get headers() {
    return this.#request.headers;
  }

  get url() {
    return this.#request.url;
  }

  get scheme() {
    return this.#request.scheme;
  }

  get host() {
    return this.#request.host;
  }

  get pathname() {
    return this.#request.pathname;
  }

  get filename() {
    return this.#request.filename;
  }

  get extension() {
    return this.#request.extension;
  }

  // Path Info properties
  get route() {
    return this.#pathInfo.route;
  }

  get org() {
    return this.#pathInfo.org;
  }

  get site() {
    return this.#pathInfo.site;
  }

  get path() {
    return this.#pathInfo.path;
  }

  get siteKey() {
    return this.#pathInfo.siteKey;
  }

  get variables() {
    return this.#pathInfo.variables;
  }

  get email() {
    return this.#pathInfo.email;
  }

  get orderId() {
    return this.#pathInfo.orderId;
  }

  /**
   * Get a header value.
   * @param {string} name - Header name
   * @returns {string|undefined}
   */
  getHeader(name) {
    return this.#request.getHeader(name);
  }

  /**
   * Get a specific variable from the router match.
   * @param {string} name - Variable name
   * @returns {string|undefined}
   */
  getVariable(name) {
    return this.#pathInfo.getVariable(name);
  }

  /**
   * Create a new RequestInfo from router match.
   *
   * @param {import('@cloudflare/workers-types').Request} request - HTTP request
   * @param {object} match - Router match result
   * @param {object} match.variables - Extracted route variables
   * @param {string} match.variables.route - Route name
   * @param {string} match.variables.org - Organization
   * @param {string} match.variables.site - Site
   * @param {string} [match.variables.path] - Path
   * @returns {Readonly<RequestInfo>}
   */
  static fromRouterMatch(request, match) {
    const { variables } = match;
    const httpRequest = new HttpRequest(request);
    const pathInfo = new PathInfo(
      variables.route,
      variables.org,
      variables.site,
      variables.path,
      variables,
    );

    return Object.freeze(new RequestInfo(httpRequest, pathInfo));
  }
}
