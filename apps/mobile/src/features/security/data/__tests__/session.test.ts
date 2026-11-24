import { canRenderFinancialRoutes, LocalSession, LOCK_AFTER_MS } from '../session';

const credentials = { pin: true, password: true };

function locked() {
  const session = new LocalSession();
  session.initialize(credentials);
  session.setAppState('active', 0, 1_000_000);
  return session;
}

function unlocked() {
  const session = locked();
  expect(session.finish(session.begin()!, true, 0)).toBe(true);
  return session;
}

describe('LocalSession', () => {
  it('starts without an authorized session even when credentials persist', () => {
    expect(new LocalSession().getSnapshot().status).toBe('initializing');
    expect(locked().getSnapshot().status).toBe('locked');
  });

  it('fails closed when credential initialization fails', () => {
    const session = locked();
    session.initialize(null);
    expect(session.begin()).toBeNull();
    expect(session.getSnapshot().status).toBe('error');
  });

  it('allows only one authentication and keeps access locked on rejection or cancellation', () => {
    const session = locked();
    const attempt = session.begin()!;
    expect(session.begin()).toBeNull();
    expect(session.finish(attempt, false, 10)).toBe(false);
    expect(session.getSnapshot().status).toBe('locked');
  });

  it('uses foreground activity for the inactivity deadline', () => {
    const session = unlocked();
    session.activity(59_000);
    session.checkInactivity(59_000 + LOCK_AFTER_MS - 1);
    expect(session.getSnapshot().status).toBe('unlocked');
    session.checkInactivity(59_000 + LOCK_AFTER_MS);
    expect(session.getSnapshot().status).toBe('locked');
  });

  it('keeps a short interruption and locks after 60 seconds in the background, even with the JS clock paused', () => {
    const session = unlocked();
    session.setAppState('background', 1, 1_000_000);
    session.setAppState('active', 2, 1_059_999);
    expect(session.getSnapshot().status).toBe('unlocked');
    session.setAppState('background', 3, 1_060_000);
    session.setAppState('active', 4, 1_120_000);
    expect(session.getSnapshot().status).toBe('locked');
  });

  it('does not authorize stale responses after a fast app switch or explicit lock', () => {
    const session = locked();
    const first = session.begin()!;
    session.setAppState('background', 1, 1_000_000);
    session.setAppState('active', 2, 1_000_003);
    const second = session.begin()!;
    expect(session.finish(first, true, 3)).toBe(false);
    session.lock();
    expect(session.finish(second, true, 4)).toBe(false);
    expect(session.getSnapshot().status).toBe('locked');
  });
});

it('keeps the complete financial navigator unavailable until foreground authentication', () => {
  const session = locked();
  expect(canRenderFinancialRoutes(session.getSnapshot(), true)).toBe(false);
  const attempt = session.begin()!;
  expect(canRenderFinancialRoutes(session.getSnapshot(), true)).toBe(false);
  session.finish(attempt, true, 0);
  expect(canRenderFinancialRoutes(session.getSnapshot(), false)).toBe(false);
  expect(canRenderFinancialRoutes(session.getSnapshot(), true)).toBe(true);
  session.lock();
  expect(canRenderFinancialRoutes(session.getSnapshot(), true)).toBe(false);
});

it('does not extend an expired session with a late native interaction', () => {
  const session = unlocked();
  session.checkInactivity(60_100, 20);
  expect(session.getSnapshot().status).toBe('locked');
});

it('does not show finance until setup has actually persisted a PIN', () => {
  const session = locked();
  session.initialize({ password: true, pin: false });
  expect(session.finish(session.begin()!, true, 0)).toBe(false);
  expect(canRenderFinancialRoutes(session.getSnapshot(), true)).toBe(false);
  expect(session.finish(session.begin()!, true, 1, { password: true, pin: true })).toBe(true);
});

it('offers one automatic prompt per lock and allows PIN or explicit retry after cancellation', () => {
  const session = locked();
  const prompt = session.begin('automatic')!;
  expect(session.begin('automatic')).toBeNull();
  expect(session.finish(prompt, false, 1)).toBe(false);
  session.setAppState('inactive', 2, 1_000_002);
  session.setAppState('active', 3, 1_000_003);
  expect(session.begin('automatic')).toBeNull();
  expect(session.finish(session.begin('manual')!, false, 4)).toBe(false);
  expect(session.finish(session.begin()!, true, 5)).toBe(true);
  session.lock();
  expect(session.begin('automatic')).not.toBeNull();
});
