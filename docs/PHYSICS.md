# Physics model

## Overview
`src/sim/solver.ts` implements a **pin-jointed truss** with **XPBD** (extended position-based dynamics).

* **Joints** are point masses. Anchors are fixed. Joint mass = max(25 kg, half the mass of attached members).
* **Members** are distance constraints with compliance `L / EA`, i.e. axial stiffness `k = EA / L` (EA per material in `config.ts`).
  A member with a free end and a fixed end is a straight rigid-ish link: transverse loads are carried by moving joints, not by bending.
* **Force readout:** XPBD multipliers give axial force `F = -lambda / h^2` (**positive = tension, negative = compression**),
  averaged over substeps and smoothed with a 50 ms time constant.
* **Cables** are one-sided: the multiplier is clamped so they only ever pull. A slack cable exerts no force and no damping.
* **Failure:** utilisation = tension / `maxTension` or compression / `maxCompression`. A member that stays above 1.0 for 0.12 s
  breaks (`damage` accumulates; it recovers slowly below 1.0). A broken member is removed from the solve and transmits nothing.
  Compression limits stand in for buckling.
* **Integration:** fixed 60 Hz frame, 10 substeps (h = 1/600 s), 2 Gauss-Seidel iterations per substep, linear damping,
  extra axial damping, velocity clamp, NaN guard (a non-finite state fails the run safely). Gravity ramps in over 0.8 s so the
  structure settles without a dynamic shock. Rendering is decoupled (`FixedStepper` clamps frame deltas, drops backlog, and does not
  accumulate time while paused). The simulation is fully deterministic.

## Vehicle
Two wheel particles joined by a rigid axle constraint (mass split evenly). Wheels collide with terrain segments and with
**drivable (road) members**. Road contact corrections are distributed to the member's end joints by barycentric weight with
generalised inverse masses, so the vehicle's weight moves the bridge and loads members; as it moves, load transfers. A motor
accelerates each grounded wheel toward the target speed along the contact tangent (reacted back into the road), with traction fading
out between ~21 and ~37 degrees of slope, so a deeply sagging "rope" deck cannot be climbed. The chassis and its suspension spring
are visual only. A run is **won** when the rear wheel passes the goal while touching terrain, and **failed** if a wheel falls below
the kill height, the vehicle is stuck (5 s), flipped (1.2 s), or the run exceeds 75 s.

## Documented approximations / limitations
* Pin joints only: no bending stiffness or bending failure of members; a straight member between two anchors never sags.
* 2D: no lateral load, no torsion. Members that cross do not interact (no intersection joints).
* Joints and members do not collide with terrain or each other after placement (placement forbids joints inside terrain).
* Material limits are game-balance numbers, not engineering data. This is not finite-element analysis.
* Vehicle is a rigid two-wheel dumbbell: no body pitching dynamics, no tyre model. Wheels are the only bodies that collide.
* XPBD with a fixed iteration count is approximate for very stiff, very long chains; behaviour was validated on the 20 reference
  solutions and random layouts (finite, deterministic), not against analytical benchmarks beyond simple supported/hanging cases.
* Peak "utilisation" is a smoothed reading; very brief contact spikes (< ~50 ms) are intentionally filtered.

## Tests
`tests/structure.test.ts`, `tests/vehicle.test.ts` and `tests/levels.test.ts` cover: supported-truss load carrying, overload failure,
tension-only cables, broken-member force removal, disconnected components, finite/stable results on 12 random seeded layouts,
determinism, vehicle crossing, missing road, breakage, destination detection and pause/resume equivalence.
