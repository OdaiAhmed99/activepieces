/// <reference types="vitest/globals" />

const { sendRequest } = vi.hoisted(() => ({ sendRequest: vi.fn() }));

vi.mock('@activepieces/pieces-common', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('@activepieces/pieces-common')
  >();
  return {
    ...actual,
    httpClient: {
      sendRequest: (...args: unknown[]) => sendRequest(...args),
    },
  };
});

import { newIssue } from '../src/lib/triggers/new-issue';
import { newRock } from '../src/lib/triggers/new-rock';
import { newTodo } from '../src/lib/triggers/new-todo';

const auth = { secret_text: 'a-token' };

function fakeStore() {
  const data = new Map<string, unknown>();
  return {
    store: {
      get: async (key: string) => (data.has(key) ? data.get(key) : null),
      put: async (key: string, value: unknown) => {
        data.set(key, value);
        return value;
      },
      delete: async (key: string) => {
        data.delete(key);
      },
    },
    data,
  };
}

function reply(body: unknown) {
  sendRequest.mockResolvedValueOnce({ body });
}

const CHECKPOINT = Date.parse('2026-09-04T09:00:00.000Z');
const AT_CHECKPOINT = '2026-09-04T09:00:00.000Z';
const ONE_MS_LATER = '2026-09-04T09:00:00.001Z';

beforeEach(() => sendRequest.mockReset());

describe('the checkpoint boundary', () => {
  test('a record created at the exact checkpoint does not fire, so nothing repeats', async () => {
    const { store, data } = fakeStore();
    data.set('lastPoll', CHECKPOINT);
    reply([{ id: 'edge', createdDate: AT_CHECKPOINT }]);

    const fired = await newTodo.run({ auth, propsValue: {}, store });

    expect(fired).toEqual([]);
  });

  test('a record one millisecond past the checkpoint fires, so nothing is lost', async () => {
    const { store, data } = fakeStore();
    data.set('lastPoll', CHECKPOINT);
    reply([{ id: 'edge', createdDate: ONE_MS_LATER }]);

    const fired = await newTodo.run({ auth, propsValue: {}, store });

    expect(fired).toHaveLength(1);
    expect(data.get('lastPoll')).toBe(Date.parse(ONE_MS_LATER));
  });

  test('the checkpoint never moves backwards, even if a page is entirely older', async () => {
    const { store, data } = fakeStore();
    data.set('lastPoll', CHECKPOINT);
    reply([
      { id: 'old', createdDate: '2026-01-01T00:00:00.000Z' },
      { id: 'older', createdDate: '2025-01-01T00:00:00.000Z' },
    ]);

    await newTodo.run({ auth, propsValue: {}, store });

    expect(data.get('lastPoll')).toBe(CHECKPOINT);
  });
});

describe('a page that is not ordered the way we asked', () => {
  test('an unsorted page still fires exactly the new records', async () => {
    const { store, data } = fakeStore();
    data.set('lastPoll', CHECKPOINT);
    reply([
      { id: 'old1', createdDate: '2026-09-04T08:00:00.000Z' },
      { id: 'new1', createdDate: '2026-09-04T09:30:00.000Z' },
      { id: 'old2', createdDate: '2026-09-04T07:00:00.000Z' },
      { id: 'new2', createdDate: '2026-09-04T09:10:00.000Z' },
    ]);

    const fired = await newTodo.run({ auth, propsValue: {}, store });

    expect(fired.map((item) => item.id)).toEqual(['new1', 'new2']);
  });

  test('the checkpoint takes the newest record in an unsorted page, not the first', async () => {
    const { store, data } = fakeStore();
    data.set('lastPoll', CHECKPOINT);
    reply([
      { id: 'first', createdDate: '2026-09-04T09:10:00.000Z' },
      { id: 'newest', createdDate: '2026-09-04T09:59:00.000Z' },
    ]);

    await newTodo.run({ auth, propsValue: {}, store });

    expect(data.get('lastPoll')).toBe(Date.parse('2026-09-04T09:59:00.000Z'));
  });
});

describe('timestamps that are not plain UTC', () => {
  test('an offset timestamp is compared as the same instant as its UTC form', async () => {
    const { store, data } = fakeStore();
    data.set('lastPoll', Date.parse('2026-09-04T12:00:00.000Z'));
    reply([
      { id: 'plus3-before', createdDate: '2026-09-04T14:00:00.000+03:00' },
      { id: 'plus3-after', createdDate: '2026-09-04T16:00:00.000+03:00' },
    ]);

    const fired = await newTodo.run({ auth, propsValue: {}, store });

    expect(fired.map((item) => item.id)).toEqual(['plus3-after']);
  });

  test('an empty created date is skipped rather than read as the epoch', async () => {
    const { store, data } = fakeStore();
    data.set('lastPoll', CHECKPOINT);
    reply([{ id: 'blank', createdDate: '' }]);

    const fired = await newTodo.run({ auth, propsValue: {}, store });

    expect(fired).toEqual([]);
    expect(data.get('lastPoll')).toBe(CHECKPOINT);
  });

  test('a null created date is skipped', async () => {
    const { store, data } = fakeStore();
    data.set('lastPoll', CHECKPOINT);
    reply([{ id: 'nulled', createdDate: null }]);

    const fired = await newTodo.run({ auth, propsValue: {}, store });

    expect(fired).toEqual([]);
  });
});

describe('a burst larger than one page', () => {
  test('a full page of new records all fire, none are capped away', async () => {
    const { store, data } = fakeStore();
    data.set('lastPoll', CHECKPOINT);
    reply(
      Array.from({ length: 100 }, (unused, index) => ({
        id: `t${index}`,
        createdDate: new Date(CHECKPOINT + (index + 1) * 1000).toISOString(),
      }))
    );

    const fired = await newTodo.run({ auth, propsValue: {}, store });

    expect(fired).toHaveLength(100);
  });

  test('the poll asks for the largest page each endpoint allows', async () => {
    const { store, data } = fakeStore();
    data.set('lastPoll', CHECKPOINT);

    reply([]);
    await newTodo.run({ auth, propsValue: {}, store });
    expect(sendRequest.mock.calls.at(-1)?.[0]?.body?.pageSize).toBe(100);

    reply({ items: [] });
    await newIssue.run({ auth, propsValue: {}, store });
    expect(sendRequest.mock.calls.at(-1)?.[0]?.body?.pageSize).toBe(100);

    reply({ items: [] });
    await newRock.run({ auth, propsValue: {}, store });
    expect(sendRequest.mock.calls.at(-1)?.[0]?.body?.pageSize).toBe(200);
  });
});

describe('when Ninety fails mid-poll', () => {
  test('a rate limit fails the run instead of reporting zero new records', async () => {
    const { store, data } = fakeStore();
    data.set('lastPoll', CHECKPOINT);
    const rateLimited = Object.assign(new Error('429'), {
      response: { status: 429, body: 'Too many requests' },
    });
    sendRequest.mockRejectedValueOnce(rateLimited);

    await expect(
      newTodo.run({ auth, propsValue: {}, store })
    ).rejects.toBeDefined();
  });

  test('a failed poll leaves the checkpoint untouched, so nothing is skipped', async () => {
    const { store, data } = fakeStore();
    data.set('lastPoll', CHECKPOINT);
    sendRequest.mockRejectedValueOnce(new Error('socket hang up'));

    await expect(
      newTodo.run({ auth, propsValue: {}, store })
    ).rejects.toBeDefined();
    expect(data.get('lastPoll')).toBe(CHECKPOINT);
  });

  test('a failure while enabling propagates rather than enabling a dead trigger', async () => {
    const { store } = fakeStore();
    sendRequest.mockRejectedValueOnce(new Error('boom'));

    await expect(
      newTodo.test({ auth, propsValue: {}, store })
    ).rejects.toBeDefined();
  });
});

describe('disabling and re-enabling', () => {
  test('disabling does not throw and leaves the checkpoint in place', async () => {
    const { store, data } = fakeStore();
    data.set('lastPoll', CHECKPOINT);

    await newTodo.onDisable({ auth, propsValue: {}, store });

    expect(data.get('lastPoll')).toBe(CHECKPOINT);
  });

  test('enabling afresh resets the checkpoint to now, so history does not replay', async () => {
    const { store, data } = fakeStore();
    data.set('lastPoll', CHECKPOINT);

    await newTodo.onEnable({ auth, propsValue: {}, store });

    const stored = data.get('lastPoll');
    expect(typeof stored).toBe('number');
    expect(stored).toBeGreaterThan(CHECKPOINT);
  });
});

describe('each trigger reads its own resource', () => {
  test('the three triggers hit three different endpoints', async () => {
    const { store, data } = fakeStore();
    data.set('lastPoll', CHECKPOINT);

    reply([]);
    await newTodo.run({ auth, propsValue: {}, store });
    const todoUrl = sendRequest.mock.calls.at(-1)?.[0]?.url;

    reply({ items: [] });
    await newIssue.run({ auth, propsValue: {}, store });
    const issueUrl = sendRequest.mock.calls.at(-1)?.[0]?.url;

    reply({ items: [] });
    await newRock.run({ auth, propsValue: {}, store });
    const rockUrl = sendRequest.mock.calls.at(-1)?.[0]?.url;

    expect(todoUrl).toBe('https://api.public.ninety.io/v1/todos/query');
    expect(issueUrl).toBe('https://api.public.ninety.io/v1/issues/query');
    expect(rockUrl).toBe('https://api.public.ninety.io/v1/rocks/query/paged');
  });

  test('the issue term filter reaches the query', async () => {
    const { store, data } = fakeStore();
    data.set('lastPoll', CHECKPOINT);
    reply({ items: [] });

    await newIssue.run({
      auth,
      propsValue: { intervalCode: 'LONG_TERM' },
      store,
    });

    expect(sendRequest.mock.calls.at(-1)?.[0]?.body?.intervalCode).toBe(
      'LONG_TERM'
    );
  });

  test('the rock owner filter reaches the query', async () => {
    const { store, data } = fakeStore();
    data.set('lastPoll', CHECKPOINT);
    reply({ items: [] });

    await newRock.run({ auth, propsValue: { userId: 'u1' }, store });

    expect(sendRequest.mock.calls.at(-1)?.[0]?.body?.userId).toBe('u1');
  });

  test('an issues response that is a bare array is still handled', async () => {
    const { store, data } = fakeStore();
    data.set('lastPoll', CHECKPOINT);
    reply([{ id: 'i1', createdDate: ONE_MS_LATER }]);

    const fired = await newIssue.run({ auth, propsValue: {}, store });

    expect(fired).toHaveLength(1);
  });

  test('a rocks response with a missing items key fires nothing rather than crashing', async () => {
    const { store, data } = fakeStore();
    data.set('lastPoll', CHECKPOINT);
    reply({ totalCount: 0 });

    const fired = await newRock.run({ auth, propsValue: {}, store });

    expect(fired).toEqual([]);
  });
});

describe('every trigger returns an array, which the engine requires', () => {
  test('all three return arrays on an empty result', async () => {
    const { store, data } = fakeStore();
    data.set('lastPoll', CHECKPOINT);

    reply([]);
    const todos = await newTodo.run({ auth, propsValue: {}, store });
    reply({ items: [] });
    const issues = await newIssue.run({ auth, propsValue: {}, store });
    reply({ items: [] });
    const rocks = await newRock.run({ auth, propsValue: {}, store });

    expect(Array.isArray(todos)).toBe(true);
    expect(Array.isArray(issues)).toBe(true);
    expect(Array.isArray(rocks)).toBe(true);
  });
});
