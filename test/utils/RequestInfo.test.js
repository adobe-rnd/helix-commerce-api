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
import { RequestInfo } from '../../src/utils/RequestInfo.js';

describe('RequestInfo', () => {
  let mockRequest;
  let mockMatch;

  beforeEach(() => {
    // Create a mock Request object
    mockRequest = {
      method: 'POST',
      url: 'https://api.example.com:8080/test/path/file.json?foo=bar&baz=qux',
      headers: new Map([
        ['Content-Type', 'application/json'],
        ['Authorization', 'Bearer token123'],
        ['X-Custom-Header', 'CustomValue'],
      ]),
    };

    // Create a mock router match
    mockMatch = {
      variables: {
        route: 'catalog',
        org: 'test-org',
        site: 'test-site',
        path: '/products/test-product',
        email: 'test@example.com',
        orderId: 'ORDER-123',
        customVar: 'custom-value',
      },
    };
  });

  describe('fromRouterMatch', () => {
    it('should create a frozen RequestInfo instance', () => {
      const requestInfo = RequestInfo.fromRouterMatch(mockRequest, mockMatch);

      assert(requestInfo instanceof RequestInfo);
      assert(Object.isFrozen(requestInfo));
    });
  });

  describe('HTTP Request properties', () => {
    let requestInfo;

    beforeEach(() => {
      requestInfo = RequestInfo.fromRouterMatch(mockRequest, mockMatch);
    });

    it('should expose method in uppercase', () => {
      assert.strictEqual(requestInfo.method, 'POST');
    });

    it('should expose headers as plain object with lowercase keys', () => {
      const { headers } = requestInfo;
      assert.strictEqual(typeof headers, 'object');
      assert.strictEqual(headers['content-type'], 'application/json');
      assert.strictEqual(headers.authorization, 'Bearer token123');
      assert.strictEqual(headers['x-custom-header'], 'CustomValue');
    });

    it('should expose url', () => {
      assert.strictEqual(requestInfo.url.toString(), mockRequest.url);
      assert.strictEqual(requestInfo.url.href, mockRequest.url);
    });

    it('should expose scheme without colon', () => {
      assert.strictEqual(requestInfo.scheme, 'https');
    });

    it('should expose host with port', () => {
      assert.strictEqual(requestInfo.host, 'api.example.com:8080');
    });

    it('should expose pathname', () => {
      assert.strictEqual(requestInfo.pathname, '/test/path/file.json');
    });

    it('should expose filename', () => {
      assert.strictEqual(requestInfo.filename, 'file.json');
    });

    it('should expose extension', () => {
      assert.strictEqual(requestInfo.extension, 'json');
    });

    it('should return empty string for filename when path ends with slash', () => {
      mockRequest.url = 'https://api.example.com/test/path/';
      const reqInfo = RequestInfo.fromRouterMatch(mockRequest, mockMatch);
      assert.strictEqual(reqInfo.filename, '');
    });

    it('should handle getHeader with case-insensitive lookup', () => {
      assert.strictEqual(requestInfo.getHeader('content-type'), 'application/json');
      assert.strictEqual(requestInfo.getHeader('Content-Type'), 'application/json');
      assert.strictEqual(requestInfo.getHeader('CONTENT-TYPE'), 'application/json');
      assert.strictEqual(requestInfo.getHeader('Authorization'), 'Bearer token123');
    });

    it('should return undefined for non-existent header', () => {
      assert.strictEqual(requestInfo.getHeader('non-existent'), undefined);
    });
  });

  describe('Path Info properties', () => {
    let requestInfo;

    beforeEach(() => {
      requestInfo = RequestInfo.fromRouterMatch(mockRequest, mockMatch);
    });

    it('should expose route', () => {
      assert.strictEqual(requestInfo.route, 'catalog');
    });

    it('should expose org', () => {
      assert.strictEqual(requestInfo.org, 'test-org');
    });

    it('should expose site', () => {
      assert.strictEqual(requestInfo.site, 'test-site');
    });

    it('should expose path', () => {
      assert.strictEqual(requestInfo.path, '/products/test-product');
    });

    it('should compute siteKey from org and site', () => {
      assert.strictEqual(requestInfo.siteKey, 'test-org--test-site');
    });

    it('should expose variables', () => {
      const { variables } = requestInfo;
      assert.deepStrictEqual(variables, mockMatch.variables);
    });

    it('should expose email convenience getter', () => {
      assert.strictEqual(requestInfo.email, 'test@example.com');
    });

    it('should expose orderId convenience getter', () => {
      assert.strictEqual(requestInfo.orderId, 'ORDER-123');
    });

    it('should support getVariable for any variable', () => {
      assert.strictEqual(requestInfo.getVariable('customVar'), 'custom-value');
      assert.strictEqual(requestInfo.getVariable('org'), 'test-org');
      assert.strictEqual(requestInfo.getVariable('site'), 'test-site');
    });

    it('should return undefined for non-existent variable', () => {
      assert.strictEqual(requestInfo.getVariable('non-existent'), undefined);
    });
  });

  describe('edge cases', () => {
    it('should handle request with GET method', () => {
      mockRequest.method = 'get'; // lowercase
      const requestInfo = RequestInfo.fromRouterMatch(mockRequest, mockMatch);
      assert.strictEqual(requestInfo.method, 'GET');
    });

    it('should handle URL without query string', () => {
      mockRequest.url = 'https://api.example.com/path';
      const requestInfo = RequestInfo.fromRouterMatch(mockRequest, mockMatch);
      assert.strictEqual(requestInfo.url.toString(), 'https://api.example.com/path');
    });

    it('should handle URL without port', () => {
      mockRequest.url = 'https://api.example.com/path';
      const requestInfo = RequestInfo.fromRouterMatch(mockRequest, mockMatch);
      assert.strictEqual(requestInfo.host, 'api.example.com');
    });

    it('should handle path without variables', () => {
      mockMatch.variables = {
        route: 'test',
        org: 'org1',
        site: 'site1',
        path: undefined,
      };
      const requestInfo = RequestInfo.fromRouterMatch(mockRequest, mockMatch);
      assert.strictEqual(requestInfo.path, undefined);
    });

    it('should handle empty headers', () => {
      mockRequest.headers = new Map();
      const requestInfo = RequestInfo.fromRouterMatch(mockRequest, mockMatch);
      assert.deepStrictEqual(requestInfo.headers, {});
    });

    it('should handle file without extension', () => {
      mockRequest.url = 'https://api.example.com/path/README';
      const requestInfo = RequestInfo.fromRouterMatch(mockRequest, mockMatch);
      assert.strictEqual(requestInfo.filename, 'README');
      assert.strictEqual(requestInfo.extension, 'README');
    });

    it('should handle file with multiple dots', () => {
      mockRequest.url = 'https://api.example.com/path/file.tar.gz';
      const requestInfo = RequestInfo.fromRouterMatch(mockRequest, mockMatch);
      assert.strictEqual(requestInfo.filename, 'file.tar.gz');
      assert.strictEqual(requestInfo.extension, 'gz');
    });

    it('should handle http scheme', () => {
      mockRequest.url = 'http://api.example.com/path';
      const requestInfo = RequestInfo.fromRouterMatch(mockRequest, mockMatch);
      assert.strictEqual(requestInfo.scheme, 'http');
    });
  });
});
