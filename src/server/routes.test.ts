// Integration test: real Fastify app + real (in-memory) SQLite.
// Env must be set BEFORE the app modules are imported — hence dynamic imports.
process.env.DB_PATH = ':memory:';
process.env.API_TOKEN = 'test-secret';

import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';

const { buildApp } = await import('./app.js');
const { db } = await import('../db/client.js');
const { posts } = await import('../db/schema.js');

const AUTH = { authorization: 'Bearer test-secret' };
let app: FastifyInstance;

before(async () => {
  app = await buildApp({ logger: false });
  // One draft (id 1) and one published post (id 2).
  await db.insert(posts).values([
    {
      kind: 'site',
      title: 'Test digest',
      slug: 'test-digest',
      summary: 'sum',
      body: 'body',
      itemIds: '[1]',
      model: 'test-model',
      status: 'draft',
      createdAt: new Date().toISOString(),
    },
    {
      kind: 'site',
      title: 'Published digest',
      slug: 'published-digest',
      summary: 'pub',
      body: 'pub body',
      itemIds: '[2]',
      model: 'test-model',
      status: 'published',
      createdAt: new Date().toISOString(),
    },
  ]);
});

after(async () => {
  await app.close();
});

describe('GET /health', () => {
  it('reports ok with db check and run introspection', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.status, 'ok');
    assert.equal(body.db, 'ok');
    assert.equal(body.pipelineRunning, false);
  });
});

describe('GET /api/posts (draft visibility)', () => {
  it('shows only published posts to untrusted callers', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/posts' });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.posts.length, 1, 'the draft is hidden, the published one shows');
    assert.equal(body.posts[0].status, 'published');
  });

  it('shows drafts to a trusted (Bearer) caller', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/posts', headers: AUTH });
    assert.equal(res.json().posts.length, 2);
  });

  it('lets a trusted caller filter by status', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/posts?status=draft', headers: AUTH });
    assert.equal(res.json().posts.length, 1);
    assert.equal(res.json().posts[0].status, 'draft');
  });

  it('rejects an invalid limit via schema validation', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/posts?limit=-5' });
    assert.equal(res.statusCode, 400);
  });

  it('404s a draft for untrusted callers, returns it for trusted', async () => {
    const anon = await app.inject({ method: 'GET', url: '/api/posts/1' });
    assert.equal(anon.statusCode, 404, 'draft is invisible to the public');
    const trusted = await app.inject({ method: 'GET', url: '/api/posts/1', headers: AUTH });
    assert.equal(trusted.statusCode, 200);
  });

  it('returns 404 for a missing post', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/posts/999' });
    assert.equal(res.statusCode, 404);
  });
});

describe('GET /api/posts/search (draft visibility)', () => {
  it('does not return drafts to untrusted search', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/posts/search?q=digest' });
    assert.equal(res.statusCode, 200);
    // Only the published 'Published digest' matches for the public.
    assert.ok(res.json().posts.every((p: { status: string }) => p.status === 'published'));
  });

  it('returns drafts to trusted search', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/posts/search?q=digest', headers: AUTH });
    assert.equal(res.json().posts.length, 2);
  });

  it('400s without q', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/posts/search' });
    assert.equal(res.statusCode, 400);
  });
});

describe('GET /feed.xml', () => {
  it('serves a feed with an absolute link for published posts only', async () => {
    const res = await app.inject({ method: 'GET', url: '/feed.xml' });
    assert.equal(res.statusCode, 200);
    assert.match(res.headers['content-type'] as string, /application\/rss\+xml/);
    assert.match(res.body, /<link>https?:\/\//, 'channel link is absolute');
    assert.match(res.body, /Published digest/);
    assert.doesNotMatch(res.body, /Test digest/, 'draft excluded from the feed');
  });
});

describe('regenerate validation', () => {
  it('rejects kind=site at schema validation (would duplicate the digest)', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/posts/2/regenerate?kind=site', headers: AUTH });
    assert.equal(res.statusCode, 400);
  });

  it('requires auth for a valid kind', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/posts/2/regenerate?kind=linkedin' });
    assert.equal(res.statusCode, 401);
  });
});

describe('publish workflow + auth', () => {
  it('rejects publish without a token', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/posts/1/publish' });
    assert.equal(res.statusCode, 401);
  });

  it('publishes and unpublishes with a valid token', async () => {
    const pub = await app.inject({ method: 'POST', url: '/api/posts/1/publish', headers: AUTH });
    assert.equal(pub.statusCode, 200);
    assert.equal(pub.json().status, 'published');

    const unpub = await app.inject({ method: 'POST', url: '/api/posts/1/unpublish', headers: AUTH });
    assert.equal(unpub.json().status, 'draft');
  });

  it('404s on publishing a missing post (with token)', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/posts/999/publish', headers: AUTH });
    assert.equal(res.statusCode, 404);
  });
});

describe('slug uniqueness', () => {
  it('ensureUniqueSlug appends a numeric suffix on collision', async () => {
    const { PostsRepository } = await import('../db/posts-repository.js');
    const repo = new PostsRepository();
    assert.equal(await repo.ensureUniqueSlug('test-digest'), 'test-digest-2');
    assert.equal(await repo.ensureUniqueSlug('brand-new'), 'brand-new');
  });
});

describe('GET /og/posts/:id.png', () => {
  const isPng = (buf: Buffer): boolean =>
    buf.length > 1000 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;

  it('renders a PNG card for a published post', async () => {
    const res = await app.inject({ method: 'GET', url: '/og/posts/2.png' });
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['content-type'], 'image/png');
    assert.match(res.headers['cache-control'] as string, /max-age=60/);
    // helmet's same-origin default is overridden so the image embeds cross-origin.
    assert.equal(res.headers['cross-origin-resource-policy'], 'cross-origin');
    assert.ok(isPng(res.rawPayload), 'body is a PNG');
  });

  it('hides a draft card from the public but serves it to a trusted caller', async () => {
    const anon = await app.inject({ method: 'GET', url: '/og/posts/1.png' });
    assert.equal(anon.statusCode, 404);
    const trusted = await app.inject({ method: 'GET', url: '/og/posts/1.png', headers: AUTH });
    assert.equal(trusted.statusCode, 200);
    assert.ok(isPng(trusted.rawPayload));
    // A draft card rendered for a reviewer must not be publicly cacheable.
    assert.equal(trusted.headers['cache-control'], undefined);
  });

  it('404s an unknown id', async () => {
    const res = await app.inject({ method: 'GET', url: '/og/posts/9999.png' });
    assert.equal(res.statusCode, 404);
  });

  it('exposes a relative ogImageUrl on serialized posts', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/posts/2' });
    assert.equal(res.json().ogImageUrl, '/og/posts/2.png');
  });
});
