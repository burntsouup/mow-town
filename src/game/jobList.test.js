import { describe, expect, it } from 'vitest';
import { JobList } from './jobList.js';

const definitions = [
  { id: 'front', title: 'Mow the front lawn', doneTitle: 'Front lawn mowed!', summary: 'x' },
  { id: 'backyard', title: 'Mow the backyard', doneTitle: 'Backyard mowed!', summary: 'y' },
];

/** Plays the current job until it completes. */
function finish(list) {
  list.currentJob.update(1, 0, true);
  list.currentJob.update(1, 1, true);
}

describe('JobList', () => {
  it('starts with the first job', () => {
    const list = new JobList(definitions, 0.98);
    expect(list.current.id).toBe('front');
    expect(list.upcoming.id).toBe('backyard');
    expect(list.allComplete).toBe(false);
  });

  it('only moves on once the current job is complete', () => {
    const list = new JobList(definitions, 0.98);
    expect(list.next()).toBeNull();
    expect(list.current.id).toBe('front');
    finish(list);
    expect(list.next().id).toBe('backyard');
    expect(list.current.id).toBe('backyard');
  });

  it('keeps separate timers for each job', () => {
    const list = new JobList(definitions, 0.98);
    finish(list);
    list.next();
    expect(list.currentJob.status).toBe('waiting');
    expect(list.currentJob.elapsed).toBe(0);
  });

  it('is all complete after the last job, and cannot go past it', () => {
    const list = new JobList(definitions, 0.98);
    finish(list);
    list.next();
    finish(list);
    expect(list.upcoming).toBeNull();
    expect(list.allComplete).toBe(true);
    expect(list.next()).toBeNull();
  });

  it('can redo the current job, or start everything over', () => {
    const list = new JobList(definitions, 0.98);
    finish(list);
    list.redoCurrent();
    expect(list.currentJob.status).toBe('waiting');
    finish(list);
    list.next();
    finish(list);
    list.resetAll();
    expect(list.current.id).toBe('front');
    expect(list.jobs.every((job) => job.status === 'waiting')).toBe(true);
  });

  it('applies a new completion threshold to every job', () => {
    const list = new JobList(definitions, 0.98);
    list.completeAt = 0.9;
    expect(list.jobs.map((job) => job.completeAt)).toEqual([0.9, 0.9]);
  });

  it('needs at least one job', () => {
    expect(() => new JobList([], 0.98)).toThrow();
  });
});
