import { describe, it, expect, vi } from 'vitest';
import MockAdapter from 'axios-mock-adapter';
import { createHttpClient } from '@bata-pos/api-clients';

/** Exercises the real interceptor logic in packages/api-clients/src/http-client.ts against a mocked transport. */
describe('http-client auth interceptor', () => {
  it('on a 401, refreshes the token exactly once and retries the original request', async () => {
    const refreshAccessToken = vi.fn().mockResolvedValue('new-access-token');
    const onAuthExpired = vi.fn();
    let currentToken = 'stale-token';

    const client = createHttpClient('http://fake-host/api/v1', {
      getAccessToken: () => currentToken,
      refreshAccessToken: async () => {
        const t = await refreshAccessToken();
        currentToken = t;
        return t;
      },
      onAuthExpired,
    });
    const mock = new MockAdapter(client);

    mock
      .onGet('/whoami')
      .replyOnce(401, { message: 'Unauthorized' })
      .onGet('/whoami')
      .replyOnce(200, { ok: true });

    const res = await client.get('/whoami');

    expect(res.data).toEqual({ ok: true });
    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(onAuthExpired).not.toHaveBeenCalled();
  });

  it('when the refresh itself fails (expired session), surfaces the original error and calls onAuthExpired', async () => {
    const onAuthExpired = vi.fn();

    const client = createHttpClient('http://fake-host/api/v1', {
      getAccessToken: () => 'stale-token',
      refreshAccessToken: async () => null,
      onAuthExpired,
    });
    const mock = new MockAdapter(client);
    mock.onGet('/whoami').reply(401, { message: 'Unauthorized' });

    await expect(client.get('/whoami')).rejects.toThrow();
    expect(onAuthExpired).toHaveBeenCalledTimes(1);
  });

  it('does not loop forever: a second 401 after the retry is not retried again', async () => {
    const onAuthExpired = vi.fn();
    const client = createHttpClient('http://fake-host/api/v1', {
      getAccessToken: () => 'token',
      refreshAccessToken: async () => 'new-token',
      onAuthExpired,
    });
    const mock = new MockAdapter(client);
    mock.onGet('/whoami').reply(401, { message: 'Unauthorized' });

    await expect(client.get('/whoami')).rejects.toThrow();
    // Exactly 2 requests hit the wire: the original, plus one retry after refresh. No infinite loop.
    expect(mock.history.get).toHaveLength(2);
  });
});
