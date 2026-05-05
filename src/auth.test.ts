import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { waitForOAuthCallback, type OAuthCallbackServer } from './auth.js';

// Fake server that captures the request handler so tests can fire synthetic
// requests without binding a real socket.
function makeFakeServer() {
  let handler: ((req: any, res: any) => void) | undefined;
  const closeFn = vi.fn();
  const server: OAuthCallbackServer = {
    on(event, listener) {
      if (event === 'request') handler = listener;
      return server;
    },
    close: closeFn,
  };
  const fireRequest = (urlPath: string) => {
    const res = {
      writeHead: vi.fn(),
      end: vi.fn(),
    };
    handler!({ url: urlPath }, res);
    return res;
  };
  return { server, fireRequest, closeFn };
}

describe('waitForOAuthCallback', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects with a clear message when the timeout elapses with no callback', async () => {
    const { server, closeFn } = makeFakeServer();
    const promise = waitForOAuthCallback(server, 12345, 'expected-state', 5000);

    // Attach a catch handler synchronously so the rejection isn't unhandled
    // when fake timers fire it.
    const settled = promise.catch((e) => e);

    vi.advanceTimersByTime(5000);

    const error = await settled;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/not received within 5s/);
    expect(closeFn).toHaveBeenCalledOnce();
  });

  it('resolves with the auth code when state matches and code is present', async () => {
    const { server, fireRequest, closeFn } = makeFakeServer();
    const promise = waitForOAuthCallback(server, 12345, 'good-state', 5000);

    const res = fireRequest('/?state=good-state&code=AUTH123');

    await expect(promise).resolves.toBe('AUTH123');
    expect(res.writeHead).toHaveBeenCalledWith(200, expect.any(Object));
    expect(closeFn).toHaveBeenCalledOnce();
  });

  it('rejects with the error param after state validation passes', async () => {
    const { server, fireRequest, closeFn } = makeFakeServer();
    const promise = waitForOAuthCallback(server, 12345, 'good-state', 5000);

    fireRequest('/?state=good-state&error=access_denied');

    await expect(promise).rejects.toThrow(/access_denied/);
    expect(closeFn).toHaveBeenCalledOnce();
  });

  it('returns a 400 and stays pending when state mismatches (CSRF attempt)', async () => {
    const { server, fireRequest, closeFn } = makeFakeServer();
    const promise = waitForOAuthCallback(server, 12345, 'good-state', 5000);

    // Attacker hits the callback first with bad state. We must NOT settle the
    // promise — legitimate callback can still arrive.
    const res1 = fireRequest('/?state=evil&error=fake');
    expect(res1.writeHead).toHaveBeenCalledWith(400, expect.any(Object));
    expect(closeFn).not.toHaveBeenCalled();

    // Then the legitimate callback arrives.
    fireRequest('/?state=good-state&code=GOODCODE');
    await expect(promise).resolves.toBe('GOODCODE');
  });

  it('clears the timeout when resolving so it cannot fire later', async () => {
    const { server, fireRequest } = makeFakeServer();
    const promise = waitForOAuthCallback(server, 12345, 'good-state', 5000);

    fireRequest('/?state=good-state&code=AUTH123');
    await expect(promise).resolves.toBe('AUTH123');

    // Advance past the timeout — must not produce an unhandled rejection
    // (which would happen if the timer wasn't cleared).
    vi.advanceTimersByTime(10000);
  });
});
