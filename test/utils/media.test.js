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

// @ts-nocheck

import assert from 'node:assert';
import sinon from 'sinon';
import { extractAndReplaceImages } from '../../src/utils/media.js';
import { DEFAULT_CONTEXT } from '../fixtures/context.js';

function u8(str) {
  return new TextEncoder().encode(str);
}

async function sha1Hex(buffer) {
  const hashBuf = await crypto.subtle.digest('SHA-1', buffer);
  return Array.from(new Uint8Array(hashBuf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

describe('utils/media extractAndReplaceImages', () => {
  let fetchStub;

  afterEach(() => {
    sinon.restore();
    if (fetchStub) {
      fetchStub.restore();
      fetchStub = undefined;
    }
  });

  it('replaces product and variant image URLs and records metrics', async () => {
    const img1 = u8('image-one');
    const img2 = u8('image-two');
    const hash1 = await sha1Hex(img1.buffer);
    const hash2 = await sha1Hex(img2.buffer);

    fetchStub = sinon.stub(globalThis, 'fetch');
    fetchStub
      .onCall(0).resolves({
        ok: true, headers: new Headers({ 'content-type': 'image/png' }), arrayBuffer: async () => img1.buffer, status: 200,
      })
      .onCall(1).resolves({
        ok: true, headers: new Headers({ 'content-type': 'image/jpeg' }), arrayBuffer: async () => img2.buffer, status: 200,
      });

    const ctx = DEFAULT_CONTEXT({
      log: { debug: sinon.stub(), info: sinon.stub() },
      config: { org: 'org', site: 'site' },
      env: {
        CATALOG_BUCKET: {
          head: sinon.stub(),
          put: sinon.stub().resolves(),
        },
      },
      metrics: { imageDownloads: [], imageUploads: [] },
    });
    // first HEAD -> not present, second HEAD -> present
    ctx.env.CATALOG_BUCKET.head.onCall(0).resolves(null);
    ctx.env.CATALOG_BUCKET.head.onCall(1).resolves({});

    const product = {
      images: [{ url: 'https://cdn.example.com/a.png' }],
      variants: [
        { images: [{ url: 'https://cdn.example.com/b.jpg' }] },
      ],
    };

    const result = await extractAndReplaceImages(ctx, product);

    assert.equal(result.images[0].url, `./media_${hash1}.png`);
    assert.equal(result.variants[0].images[0].url, `./media_${hash2}.jpg`);

    // first image uploaded, second existed
    assert(ctx.env.CATALOG_BUCKET.put.calledOnce);

    // metrics captured
    assert.equal(ctx.metrics.imageDownloads.length, 2);
    assert.equal(ctx.metrics.imageUploads.length, 2);
    assert.equal(ctx.metrics.imageUploads[0].alreadyExists, false);
    assert.equal(ctx.metrics.imageUploads[1].alreadyExists, true);
  });

  it('skips invalid URLs and does not upload', async () => {
    fetchStub = sinon.stub(globalThis, 'fetch');
    const ctx = DEFAULT_CONTEXT({
      log: { debug: sinon.stub(), info: sinon.stub() },
      config: { org: 'org', site: 'site' },
      env: {
        CATALOG_BUCKET: {
          head: sinon.stub(),
          put: sinon.stub().resolves(),
        },
      },
      metrics: { imageDownloads: [], imageUploads: [] },
    });

    const product = { images: [{ url: '' }], variants: [] };
    const result = await extractAndReplaceImages(ctx, product);

    assert.equal(result.images[0].url, '');
    assert(ctx.env.CATALOG_BUCKET.head.notCalled);
    assert(ctx.env.CATALOG_BUCKET.put.notCalled);
    assert.equal(ctx.metrics.imageDownloads.length, 0);
    assert.equal(ctx.metrics.imageUploads.length, 0);
  });

  it('processes duplicate URLs only once', async () => {
    const img = u8('same-image');
    const hash = await sha1Hex(img.buffer);

    fetchStub = sinon.stub(globalThis, 'fetch').resolves({
      ok: true, headers: new Headers({ 'content-type': 'image/webp' }), arrayBuffer: async () => img.buffer, status: 200,
    });

    const ctx = DEFAULT_CONTEXT({
      log: { debug: sinon.stub(), info: sinon.stub() },
      config: { org: 'org', site: 'site' },
      env: {
        CATALOG_BUCKET: {
          head: sinon.stub(),
          put: sinon.stub().resolves(),
        },
      },
      metrics: { imageDownloads: [], imageUploads: [] },
    });
    ctx.env.CATALOG_BUCKET.head.resolves(null);

    const product = {
      images: [{ url: 'https://cdn.example.com/dup.webp' }, { url: 'https://cdn.example.com/dup.webp' }],
    };

    const result = await extractAndReplaceImages(ctx, product);

    assert.equal(result.images[0].url, `./media_${hash}.webp`);
    assert.equal(result.images[1].url, `./media_${hash}.webp`);
    assert.equal(fetchStub.callCount, 1);
    assert(ctx.env.CATALOG_BUCKET.put.calledOnce);
  });

  it('handles URLs without file extension (uses everything after last dot)', async () => {
    const img = u8('noext');
    const hash = await sha1Hex(img.buffer);

    fetchStub = sinon.stub(globalThis, 'fetch').resolves({
      ok: true, headers: new Headers({ 'content-type': 'image/png' }), arrayBuffer: async () => img.buffer, status: 200,
    });

    const ctx = DEFAULT_CONTEXT({
      log: { debug: sinon.stub(), info: sinon.stub() },
      config: { org: 'org', site: 'site' },
      env: {
        CATALOG_BUCKET: {
          head: sinon.stub(),
          put: sinon.stub().resolves(),
        },
      },
      metrics: { imageDownloads: [], imageUploads: [] },
    });
    ctx.env.CATALOG_BUCKET.head.resolves(null);

    const product = { images: [{ url: 'https://cdn.example.com/image?id=123' }] };
    const result = await extractAndReplaceImages(ctx, product);

    // current implementation appends everything after the last dot
    assert.equal(result.images[0].url, `./media_${hash}.com/image?id=123`);
    assert(ctx.env.CATALOG_BUCKET.put.calledOnce);
  });

  it('throws when image fetch fails', async () => {
    fetchStub = sinon.stub(globalThis, 'fetch').resolves({ ok: false, status: 404 });
    const ctx = DEFAULT_CONTEXT({
      log: { debug: sinon.stub(), info: sinon.stub() },
      config: { org: 'org', site: 'site' },
      env: {
        CATALOG_BUCKET: {
          head: sinon.stub(),
          put: sinon.stub().resolves(),
        },
      },
      metrics: { imageDownloads: [], imageUploads: [] },
    });
    const product = { images: [{ url: 'https://cdn.example.com/missing.png' }] };

    await assert.rejects(
      () => extractAndReplaceImages(ctx, product),
      (err) => err && err.response && err.response.status === 502,
    );
  });
});
