import { PHYSICS } from '../config';

/**
 * Fixed-timestep accumulator. Real frame deltas are clamped so a stalled tab cannot cause a
 * burst of physics steps, and nothing advances while paused (pausing never banks time).
 */
export class FixedStepper {
  private acc = 0;
  constructor(private dt = PHYSICS.fixedDt, private maxFrameDelta = 0.1, private maxStepsPerFrame = 8) {}
  /** Returns the number of fixed steps to run for this rendered frame. */
  advance(realDt: number, paused: boolean, speed = 1): number {
    if (paused || !(realDt > 0)) return 0;
    this.acc += Math.min(realDt, this.maxFrameDelta) * speed;
    let steps = 0;
    while (this.acc >= this.dt && steps < this.maxStepsPerFrame) { this.acc -= this.dt; steps++; }
    if (steps === this.maxStepsPerFrame) this.acc = 0; // drop backlog rather than spiral
    return steps;
  }
  reset(): void { this.acc = 0; }
}
