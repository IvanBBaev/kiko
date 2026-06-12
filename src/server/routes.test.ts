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

let app: FastifyInstance;

before(async () => {
  app = await buildApp({ logger: false });
  await db.insert(posts).values({
    kind: 'site',
    title: 'Test digest',
    slug: 'test-digest',
    summary: 'sum',
    body: 'body',
    itemIds: '[1]',
    model: 'test-model',
    createdAt: new Date().toISOString(),
  });
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

describe('GET /api/posts', () => {
  it('lists posts with pagination metadata', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/posts' });
    assert.equal(res.statusCode, 200);
    const body = res.json();
    assert.equal(body.posts.length, 1);
    assert.equal(body.total, 1);
    assert.equal(body.hasMore, false);
  });

  it('filters by status', async () => {
    const drafts = await app.inject({ method: 'GET', url: '/api/posts?status=draft' });
    assert.equal(drafts.json().posts.length, 1);
    const published = await app.inject({ method: 'GET', url: '/api/posts?status=published' });
    assert.equal(published.json().posts.length, 0);
  });

  it('rejects an invalid limit via schema validation', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/posts?limit=-5' });
    assert.equal(res.statusCode, 400);
  });

  it('returns 404 for a missing post', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/posts/999' });
    assert.equal(res.statusCode, 404);
  });
});

describe('GET /api/posts/search', () => {
  it('finds posts via FTS', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/posts/search?q=digest' });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().posts.length, 1);
  });

  it('returns empty for non-matching query', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/posts/search?q=zzzunfindable' });
    assert.equal(res.json().posts.length, 0);
  });

  it('400s without q', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/posts/search' });
    assert.equal(res.statusCode, 400);
  });
});

describe('publish workflow + auth', () => {
  it('rejects publish without a token', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/posts/1/publish' });
    assert.equal(res.statusCode, 401);
  });

  it('publishes and unpublishes with a valid token', async () => {
    const auth = { authorization: 'Bearer test-secret' };

    const pub = await app.inject({ method: 'POST', url: '/api/posts/1/publish', headers: auth });
    assert.equal(pub.statusCode, 200);
    assert.equal(pub.json().status, 'published');

    const published = await app.inject({ method: 'GET', url: '/api/posts?status=published' });
    assert.equal(published.json().posts.length, 1);

    const unpub = await app.inject({ method: 'POST', url: '/api/posts/1/unpublish', headers: auth });
    assert.equal(unpub.json().status, 'draft');
  });

  it('404s on publishing a missing post (with token)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/posts/999/publish',
      headers: { authorization: 'Bearer test-secret' },
    });
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
