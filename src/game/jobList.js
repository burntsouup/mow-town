// @ts-check
import { Job } from './job.js';

/**
 * The jobs in the level, in order. You work on one at a time; finishing it lets you move on
 * to the next. Pure logic, like Job.
 *
 * @typedef {{ id: string, name?: string, title: string, doneTitle: string, summary: string,
 *   hint?: string }} JobDefinition
 *   name for sentences ("the front lawn"); title while working; doneTitle once finished;
 *   summary before the time ("Front lawn mowed in"); hint shown under the title.
 */
export class JobList {
  /**
   * @param {JobDefinition[]} definitions In the order they're played.
   * @param {number} completeAt Fraction of the work that counts as done (see Job).
   */
  constructor(definitions, completeAt) {
    if (definitions.length === 0) throw new Error('JobList needs at least one job');
    this.definitions = definitions;
    this.jobs = definitions.map(() => new Job(completeAt));
    this.index = 0;
  }

  /** The definition of the job being worked on. */
  get current() {
    return this.definitions[this.index];
  }

  /** The rules/timer of the job being worked on. */
  get currentJob() {
    return this.jobs[this.index];
  }

  /** The job after the current one, or null if this is the last. */
  get upcoming() {
    return this.definitions[this.index + 1] ?? null;
  }

  /** True once the last job is complete. */
  get allComplete() {
    return this.upcoming === null && this.currentJob.isComplete;
  }

  /** @param {number} value */
  set completeAt(value) {
    for (const job of this.jobs) job.completeAt = value;
  }

  /**
   * Moves on to the next job, but only once the current one is done.
   *
   * @returns {JobDefinition | null} The job that just started, or null if we can't move on.
   */
  next() {
    if (!this.currentJob.isComplete || !this.upcoming) return null;
    this.index++;
    return this.current;
  }

  /** Makes the current job start over (its lawn is reset elsewhere). */
  redoCurrent() {
    this.currentJob.reset();
  }

  /** Back to the very first job, as if starting fresh. */
  resetAll() {
    for (const job of this.jobs) job.reset();
    this.index = 0;
  }
}
