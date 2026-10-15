# Levels

30 levels, 5 per tier (6 tiers). Gap/height/vehicle values come from `src/levels/levels.ts`; budgets and gold targets were set from the cost of
a verified reference solution (`src/levels/solutions.ts`): gold = ceil(1.08 x reference cost), budget = reference x 1.8 / 1.6 / 1.45 / 1.35 / 1.3 / 1.3 by tier.

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
| 21 | Rush Hour | 5 | Van | one deep truss, 20 m |
| 22 | Stepping Stones | 5 | Pickup | four spans over rocks at different heights |
| 23 | Wire Walk | 5 | Bus | road + cable only, two towers |
| 24 | Heavy Metal | 5 | Dump truck | steel + road only, uphill |
| 25 | Deep Gorge | 5 | Bus | very deep canyon, tall truss |
| 26 | Island Hopper | 6 | Bus | three islands at different heights, four spans |
| 27 | Skyline | 6 | Dump truck | tower anchor, no wood for gold |
| 28 | Penny Pincher | 6 | Van | wood only, 8-beam limit (quick puzzle) |
| 29 | Up and Over | 6 | Bus | steep 8 m climb with a mid pier |
| 30 | Grand Finale | 6 | Dump truck | 44 m, uneven banks, two towers |

**Stars:** 1 = vehicle arrives; 2 = cost at or below the gold target **and no member broke**; 3 = also meets the level challenge
(max beams / forbidden material / peak load below a % of member strength).

**Solvability proof:** `tests/levels.test.ts` builds each reference solution through the real construction rules at the real budget,
runs the real simulation, and asserts: win, zero breaks, gold budget met, challenge met, 3 stars. It also asserts an empty build fails.
**Caveat:** solvability is proven by the reference designs; difficulty tuning has not been playtested with human players.
