import { describe, expect, it } from 'vitest';
import { formatDuration, Job } from './job.js';

describe('Job', () => {
  it('waits, without timing, until you first spray', () => {
    const job = new Job(0.98);
    job.update(5, 0, false);
    expect(job.status).toBe('waiting');
    expect(job.elapsed).toBe(0);
    job.update(1, 0, true);
    expect(job.status).toBe('active');
    expect(job.elapsed).toBe(1);
  });

  it('keeps timing between sprays once started', () => {
    const job = new Job(0.98);
    job.update(1, 0, true);
    job.update(2, 0.3, false);
    expect(job.elapsed).toBe(3);
  });

  it('completes exactly once when enough dirt is gone', () => {
    const job = new Job(0.98);
    job.update(1, 0.5, true);
    expect(job.update(1, 0.979, true)).toBeNull();
    expect(job.update(1, 0.98, true)).toBe('completed');
    expect(job.isComplete).toBe(true);
    expect(job.update(1, 1, true)).toBeNull();
  });

  it('stops the timer at completion', () => {
    const job = new Job(0.98);
    job.update(10, 0.99, true);
    const time = job.elapsed;
    job.update(10, 1, true);
    expect(job.elapsed).toBe(time);
  });

  it('shows 100% only when the job is complete', () => {
    const job = new Job(0.98);
    expect(job.displayProgress(0.49)).toBeCloseTo(0.5);
    expect(job.displayProgress(0.979)).toBeLessThan(1);
    job.update(1, 0.98, true);
    expect(job.displayProgress(0.98)).toBe(1);
  });

  it('can be reset for another go', () => {
    const job = new Job(0.98);
    job.update(3, 0.99, true);
    job.reset();
    expect(job.status).toBe('waiting');
    expect(job.elapsed).toBe(0);
  });
});

describe('formatDuration', () => {
  it('formats minutes and zero-padded seconds', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(7.9)).toBe('0:07');
    expect(formatDuration(127)).toBe('2:07');
    expect(formatDuration(3600)).toBe('60:00');
  });
});
