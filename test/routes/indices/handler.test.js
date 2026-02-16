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
import sinon from 'sinon';
import { SUPERUSER_CONTEXT } from '../../fixtures/context.js';
import handler from '../../../src/routes/indices/handler.js';

describe('routes/indices/handler', () => {
  let ctx;
  let storageClient;

  beforeEach(() => {
    storageClient = {
      queryIndexExists: sinon.stub(),
      saveQueryIndexByPath: sinon.stub(),
      deleteQueryIndex: sinon.stub(),
      fetchIndexRegistry: sinon.stub(),
      saveIndexRegistry: sinon.stub(),
    };

    ctx = SUPERUSER_CONTEXT({
      requestInfo: {
        org: 'test-org',
        site: 'test-site',
        path: '/products/index.json',
        method: 'POST',
      },
      attributes: {
        storageClient,
      },
      log: {
        debug: sinon.stub(),
        error: sinon.stub(),
      },
    });
  });

  describe('POST (create)', () => {
    it('should create an index and update registry', async () => {
      storageClient.fetchIndexRegistry.resolves({ data: {}, etag: 'etag-1' });
      storageClient.saveIndexRegistry.resolves();
      storageClient.saveQueryIndexByPath.resolves();

      const response = await handler(ctx, null);

      assert.strictEqual(response.status, 201);
      assert(storageClient.fetchIndexRegistry.calledOnce);
      assert(storageClient.saveIndexRegistry.calledOnce);
      assert(storageClient.saveQueryIndexByPath.calledOnce);

      const [org, site, registry, etag] = storageClient.saveIndexRegistry.firstCall.args;
      assert.strictEqual(org, 'test-org');
      assert.strictEqual(site, 'test-site');
      assert.strictEqual(etag, 'etag-1');
      assert(registry['/products/index.json']);
      assert(registry['/products/index.json'].lastmod);
    });

    it('should return 409 if index already exists in registry', async () => {
      storageClient.fetchIndexRegistry.resolves({
        data: {
          '/products/index.json': { lastmod: '2025-01-07T00:00:00.000Z' },
        },
        etag: 'etag-1',
      });

      const response = await handler(ctx, null);

      assert.strictEqual(response.status, 409);
      assert.strictEqual(response.headers.get('x-error'), 'index already exists');
      assert(storageClient.saveIndexRegistry.notCalled);
      assert(storageClient.saveQueryIndexByPath.notCalled);
    });

    it('should return 409 on registry conflict (precondition failed)', async () => {
      storageClient.fetchIndexRegistry.resolves({ data: {}, etag: 'etag-1' });

      const preconditionError = new Error('Precondition failed: etag mismatch');
      // @ts-ignore
      preconditionError.code = 'PRECONDITION_FAILED';
      storageClient.saveIndexRegistry.rejects(preconditionError);

      const response = await handler(ctx, null);

      assert.strictEqual(response.status, 409);
      assert.strictEqual(response.headers.get('x-error'), 'conflict: concurrent modification');
      assert(storageClient.saveQueryIndexByPath.notCalled);
    });

    it('should return 502 if registry update fails with other error', async () => {
      storageClient.fetchIndexRegistry.resolves({ data: {}, etag: 'etag-1' });
      storageClient.saveIndexRegistry.rejects(new Error('Network error'));

      const response = await handler(ctx, null);

      assert.strictEqual(response.status, 502);
      assert.strictEqual(response.headers.get('x-error'), 'failed to update registry');
      assert(storageClient.saveQueryIndexByPath.notCalled);
      assert(ctx.log.error.called);
    });

    it('should return 502 and rollback if index creation fails', async () => {
      storageClient.fetchIndexRegistry.onCall(0).resolves({ data: {}, etag: 'etag-1' });
      storageClient.saveIndexRegistry.onCall(0).resolves();
      storageClient.saveQueryIndexByPath.rejects(new Error('Storage error'));

      // For rollback
      storageClient.fetchIndexRegistry.onCall(1).resolves({
        data: { '/products/index.json': { lastmod: '2025-01-07T00:00:00.000Z' } },
        etag: 'etag-2',
      });
      storageClient.saveIndexRegistry.onCall(1).resolves();

      const response = await handler(ctx, null);

      assert.strictEqual(response.status, 502);
      assert.strictEqual(response.headers.get('x-error'), 'failed to create index');
      assert.strictEqual(storageClient.fetchIndexRegistry.callCount, 2);
      assert.strictEqual(storageClient.saveIndexRegistry.callCount, 2);

      // Verify rollback removed the entry
      const [, , rollbackRegistry] = storageClient.saveIndexRegistry.secondCall.args;
      assert.strictEqual(rollbackRegistry['/products/index.json'], undefined);
    });

    it('should succeed even if rollback fails', async () => {
      storageClient.fetchIndexRegistry.onCall(0).resolves({ data: {}, etag: 'etag-1' });
      storageClient.saveIndexRegistry.onCall(0).resolves();
      storageClient.saveQueryIndexByPath.rejects(new Error('Storage error'));

      // Rollback fails
      storageClient.fetchIndexRegistry.onCall(1).resolves({ data: {}, etag: 'etag-2' });
      storageClient.saveIndexRegistry.onCall(1).rejects(new Error('Rollback failed'));

      const response = await handler(ctx, null);

      assert.strictEqual(response.status, 502);
      assert.strictEqual(response.headers.get('x-error'), 'failed to create index');
    });

    it('should return 404 if path is missing', async () => {
      ctx.requestInfo.path = null;

      const response = await handler(ctx, null);

      assert.strictEqual(response.status, 404);
      assert.strictEqual(response.headers.get('x-error'), 'path is required');
    });

    it('should return 400 for invalid path', async () => {
      ctx.requestInfo.path = '/invalid path with spaces/index.json';

      const response = await handler(ctx, null);

      assert.strictEqual(response.status, 400);
      assert.strictEqual(response.headers.get('x-error'), 'invalid path');
      assert(storageClient.fetchIndexRegistry.notCalled);
    });

    it('should return 400 if path does not end with /index.json', async () => {
      ctx.requestInfo.path = '/products/';

      const response = await handler(ctx, null);

      assert.strictEqual(response.status, 400);
      assert.strictEqual(response.headers.get('x-error'), 'path must end with /index.json');
      assert(storageClient.fetchIndexRegistry.notCalled);
    });

    it('should accept path with underscores (locale paths)', async () => {
      ctx.requestInfo.path = '/ca/en_us/index.json';
      storageClient.fetchIndexRegistry.resolves({ data: {}, etag: 'etag-1' });
      storageClient.saveIndexRegistry.resolves();
      storageClient.saveQueryIndexByPath.resolves();

      const response = await handler(ctx, null);

      assert.strictEqual(response.status, 201);
      assert(storageClient.saveQueryIndexByPath.calledWith('test-org', 'test-site', '/ca/en_us', {}));
      const [, , registry] = storageClient.saveIndexRegistry.firstCall.args;
      assert(registry['/ca/en_us/index.json']);
    });

    it('should handle path ending with /index.json normally', async () => {
      ctx.requestInfo.path = '/products/index.json';
      storageClient.fetchIndexRegistry.resolves({ data: {}, etag: 'etag-1' });
      storageClient.saveIndexRegistry.resolves();
      storageClient.saveQueryIndexByPath.resolves();

      const response = await handler(ctx, null);

      assert.strictEqual(response.status, 201);
      // Should call saveQueryIndexByPath with path without /index.json suffix
      assert(storageClient.saveQueryIndexByPath.calledWith('test-org', 'test-site', '/products', {}));
      // Registry should have the normalized path
      const [, , registry] = storageClient.saveIndexRegistry.firstCall.args;
      assert(registry['/products/index.json']);
    });
  });

  describe('DELETE (remove)', () => {
    beforeEach(() => {
      ctx.requestInfo.method = 'DELETE';
    });

    it('should delete an index and update registry', async () => {
      storageClient.queryIndexExists.resolves(true);
      storageClient.fetchIndexRegistry.resolves({
        data: { '/products/index.json': { lastmod: '2025-01-07T00:00:00.000Z' } },
        etag: 'etag-1',
      });
      storageClient.deleteQueryIndex.resolves();
      storageClient.saveIndexRegistry.resolves();

      const response = await handler(ctx, null);

      assert.strictEqual(response.status, 204);
      assert(storageClient.deleteQueryIndex.calledOnce);
      assert(storageClient.deleteQueryIndex.calledWith('test-org', 'test-site', '/products'));
      assert(storageClient.saveIndexRegistry.calledOnce);

      const [org, site, registry, etag] = storageClient.saveIndexRegistry.firstCall.args;
      assert.strictEqual(org, 'test-org');
      assert.strictEqual(site, 'test-site');
      assert.strictEqual(etag, 'etag-1');
      assert.strictEqual(registry['/products/index.json'], undefined);
    });

    it('should return 404 if index does not exist', async () => {
      storageClient.queryIndexExists.resolves(false);

      const response = await handler(ctx, null);

      assert.strictEqual(response.status, 404);
      assert.strictEqual(response.headers.get('x-error'), 'index does not exist');
      assert(storageClient.deleteQueryIndex.notCalled);
    });
  });

  describe('other methods', () => {
    it('should return 405 for unsupported methods', async () => {
      ctx.requestInfo.method = 'GET';

      const response = await handler(ctx, null);

      assert.strictEqual(response.status, 405);
      assert.strictEqual(response.headers.get('x-error'), 'method not allowed');
    });
  });
});
