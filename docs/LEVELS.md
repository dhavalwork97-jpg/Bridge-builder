# Levels

20 levels, 5 per tier. Gap/height/vehicle values come from `src/levels/levels.ts`; budgets and gold targets were set from the cost of
a verified reference solution (`src/levels/solutions.ts`): gold = ceil(1.08 x reference cost), budget = reference x 1.8 / 1.6 / 1.45 / 1.35 by tier.

| # | Name | Tier | Vehicle | Idea |
|---|---|---|---|---|
| 1 | First Crossing | 1 | Pickup | one road |
| 2 | Short Hop | 1 | Pickup | mid joint braced with wood |
| 3 | Downhill Run | 1 | Pickup | sloped deck, wooden truss |
| 4 | Steel Intro | 1 | Pickup | first steel |
| 5 | Rising Road | 1 | Pickup | uphill |
| 6 | Wide Canyon | 2 | Pickup | 18 m span |
| 7 | The Island | 2 | Pickup | two spans over a rock island |
| 8 | Cliff Step | 2 | Van | downhill deck |
| 9 | Timber Only | 2 | Pickup | no steel |
| 10 | Twin Pillars | 2 | Van | three spans |
| 11 | First Cables | 3 | Van | cables as tension chords |
| 12 | Tall Pylon | 3 | Van | cable-stayed from a pylon |
| 13 | Heavy Haul | 3 | Bus | heavy vehicle |
| 14 | Uneven Banks | 3 | Bus | different bank heights |
| 15 | Cable Stayed | 3 | Bus | pylon stays |
| 16 | Long Span | 4 | Bus | 34 m, two pylons |
| 17 | Canyon Tower | 4 | Bus | uphill + island |
| 18 | Ruined Crossing | 4 | Dump truck | 36 m, three piers |
| 19 | Titan Load | 4 | Dump truck | steel only, heavy |
| 20 | Grand Gorge | 4 | Dump truck | uneven banks + island |

**Stars:** 1 = vehicle arrives; 2 = cost at or below the gold target **and no member broke**; 3 = also meets the level challenge
(max beams / forbidden material / peak load below a % of member strength).

**Solvability proof:** `tests/levels.test.ts` builds each reference solution through the real construction rules at the real budget,
runs the real simulation, and asserts: win, zero breaks, gold budget met, challenge met, 3 stars. It also asserts an empty build fails.
**Caveat:** solvability is proven by the reference designs; difficulty tuning has not been playtested with human players.
