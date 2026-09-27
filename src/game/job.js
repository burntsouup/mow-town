// @ts-check

/**
 * The rules of a cleaning job. Pure logic: no rendering, no Babylon.
 *
 * - The job waits until you first spray, so the timer measures cleaning, not wandering.
 * - It's complete once `completeAt` of the dirt is gone (e.g. 98%), so you're not forced to
 *   hunt down the last few invisible specks. The game clears those with a flourish.
 */
export class Job {
  /** @param {number} completeAt Fraction of dirt (0..1) that counts as done. */
  constructor(completeAt) {
    this.completeAt = completeAt;
    this.reset();
  }

  reset() {
    /** @type {'waiting' | 'active' | 'complete'} */
    this.status = 'waiting';
    /** Seconds spent on the job, from the first spray until completion. */
    this.elapsed = 0;
  }

  get isComplete() {
    return this.status === 'complete';
  }

  /**
   * Progress for display: reaches exactly 1 (100%) at the moment the job completes.
   *
   * @param {number} progress Fraction of dirt cleaned, 0..1.
   */
  displayProgress(progress) {
    if (this.isComplete) return 1;
    return Math.min(1, Math.max(0, progress / this.completeAt));
  }

  /**
   * @param {number} dt Seconds since the previous frame.
   * @param {number} progress Fraction of dirt cleaned, 0..1.
   * @param {boolean} isSpraying
   * @returns {'completed' | null} 'completed' on the one frame the job finishes.
   */
  update(dt, progress, isSpraying) {
    if (this.status === 'complete') return null;
    if (this.status === 'waiting' && isSpraying) this.status = 'active';
    if (this.status === 'active') this.elapsed += dt;
    if (progress >= this.completeAt) {
      this.status = 'complete';
      return 'completed';
    }
    return null;
  }
}

/**
 * Formats seconds as minutes:seconds, e.g. 127 → "2:07".
 *
 * @param {number} seconds
 */
export function formatDuration(seconds) {
  const whole = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}
