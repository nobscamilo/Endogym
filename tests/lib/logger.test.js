import { afterEach, describe, expect, it, vi } from 'vitest';

import { AuthenticationError } from '../../src/lib/auth.js';
import { withTrace } from '../../src/lib/logger.js';

describe('structured logger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs expected authentication rejections as info', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(withTrace('meals_list', async () => {
      throw new AuthenticationError('No token');
    }, { traceId: 'trace-test' })).rejects.toThrow('No token');

    expect(info.mock.calls.map(([line]) => JSON.parse(line).message)).toContain('operation_rejected');
    expect(error).not.toHaveBeenCalled();
  });

  it('keeps unexpected failures at error level', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(withTrace('meals_list', async () => {
      throw new Error('Firestore unavailable');
    }, { traceId: 'trace-test' })).rejects.toThrow('Firestore unavailable');

    expect(JSON.parse(error.mock.calls[0][0]).message).toBe('operation_failed');
  });
});
