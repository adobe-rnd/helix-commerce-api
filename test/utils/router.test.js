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

import assert from 'assert';
import Router from '../../src/utils/router/index.js';

describe('Router', () => {
  it('should match literal routes', () => {
    const router = new Router((segs) => segs.join('/'));
    const handler = () => 'test';

    router.add('/test', handler);

    const result = router.match('/test');
    assert.ok(result);
    assert.strictEqual(result.handler, handler);
    assert.strictEqual(result.variables.route, 'test');
  });

  it('should match variable segments', () => {
    const router = new Router((segs) => segs.join('/'));
    const handler = () => 'catalog';

    router.add('/:org/sites/:site/catalog', handler);

    const result = router.match('/adobe/sites/mysite/catalog');
    assert.ok(result);
    assert.strictEqual(result.handler, handler);
    assert.strictEqual(result.variables.org, 'adobe');
    assert.strictEqual(result.variables.site, 'mysite');
  });

  it('should match wildcard paths', () => {
    const router = new Router((segs) => segs.join('/'));
    const handler = () => 'catalog';

    router.add('/:org/sites/:site/catalog/*', handler);

    const result = router.match('/adobe/sites/mysite/catalog/us/en/products/blender-pro-500');
    assert.ok(result);
    assert.strictEqual(result.handler, handler);
    assert.strictEqual(result.variables.org, 'adobe');
    assert.strictEqual(result.variables.site, 'mysite');
    assert.strictEqual(result.variables.path, '/us/en/products/blender-pro-500');
  });

  it('should match literal * for bulk operations', () => {
    const router = new Router((segs) => segs.join('/'));
    const handler = () => 'catalog';

    router.add('/:org/sites/:site/catalog/*', handler);

    const result = router.match('/adobe/sites/mysite/catalog/*');
    assert.ok(result);
    assert.strictEqual(result.handler, handler);
    assert.strictEqual(result.variables.org, 'adobe');
    assert.strictEqual(result.variables.site, 'mysite');
    assert.strictEqual(result.variables.path, '/*');
  });

  it('should return null for non-matching routes', () => {
    const router = new Router((segs) => segs.join('/'));
    const handler = () => 'catalog';

    router.add('/:org/sites/:site/catalog/*', handler);

    const result = router.match('/adobe/sites/mysite/orders');
    assert.strictEqual(result, null);
  });

  it('should match multiple routes', () => {
    const router = new Router((segs) => segs.join('/'));
    const catalogHandler = () => 'catalog';
    const ordersHandler = () => 'orders';

    router.add('/:org/sites/:site/catalog/*', catalogHandler);
    router.add('/:org/sites/:site/orders', ordersHandler);

    const catalogResult = router.match('/adobe/sites/mysite/catalog/us/en/products/test');
    assert.ok(catalogResult);
    assert.strictEqual(catalogResult.handler, catalogHandler);
    assert.strictEqual(catalogResult.variables.path, '/us/en/products/test');

    const ordersResult = router.match('/adobe/sites/mysite/orders');
    assert.ok(ordersResult);
    assert.strictEqual(ordersResult.handler, ordersHandler);
    assert.strictEqual(ordersResult.variables.org, 'adobe');
    assert.strictEqual(ordersResult.variables.site, 'mysite');
  });

  it('should handle routes with trailing slashes', () => {
    const router = new Router((segs) => segs.join('/'));
    const handler = () => 'catalog';

    router.add('/:org/sites/:site/catalog/*', handler);

    const result = router.match('/adobe/sites/mysite/catalog/us/en/products/');
    assert.ok(result);
    assert.strictEqual(result.variables.path, '/us/en/products/');
  });

  it('should generate external paths with variables', () => {
    const router = new Router((segs) => segs.join('/'));
    const handler = () => 'catalog';

    router.add('/:org/sites/:site/catalog/*', handler);

    const externalPath = router.external(':org/sites/:site/catalog/*', {
      org: 'adobe',
      site: 'mysite',
      path: '/us/en/products/blender-pro-500',
    });

    assert.strictEqual(externalPath, '/adobe/sites/mysite/catalog/us/en/products/blender-pro-500');
  });

  it('should generate external paths for literal routes', () => {
    const router = new Router((segs) => segs.join('/'));
    const handler = () => 'test';

    router.add('/test/literal/path', handler);

    const externalPath = router.external('test/literal/path', {});

    assert.strictEqual(externalPath, '/test/literal/path');
  });

  it('should generate external paths with only variables', () => {
    const router = new Router((segs) => segs.join('/'));
    const handler = () => 'orders';

    router.add('/:org/sites/:site/orders', handler);

    const externalPath = router.external(':org/sites/:site/orders', {
      org: 'adobe',
      site: 'mysite',
    });

    assert.strictEqual(externalPath, '/adobe/sites/mysite/orders');
  });

  it('should throw error for non-existent route in external()', () => {
    const router = new Router((segs) => segs.join('/'));

    assert.throws(
      () => router.external('nonexistent', {}),
      'route not found: nonexistent',
    );
  });

  it('should generate external path for root route', () => {
    const router = new Router((segs) => segs.join('/') || '/');
    const handler = () => 'root';

    router.add('/', handler);

    const externalPath = router.external('/', {});

    assert.strictEqual(externalPath, '/');
  });

  it('should handle path without leading slash in external()', () => {
    const router = new Router((segs) => segs.join('/'));
    const handler = () => 'catalog';

    router.add('/:org/sites/:site/catalog/*', handler);

    const externalPath = router.external(':org/sites/:site/catalog/*', {
      org: 'adobe',
      site: 'mysite',
      path: 'us/en/products/blender-pro-500', // No leading slash
    });

    assert.strictEqual(externalPath, '/adobe/sites/mysite/catalog/us/en/products/blender-pro-500');
  });
});
