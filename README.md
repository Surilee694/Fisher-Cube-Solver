# Fischer Cube Solver

A web app that solves a real **Fischer Cube** – a 3×3×3 mechanism with a shell
rotated 45° – and walks you through the solution step by step in 3D.

It models the puzzle as it physically is: 26 cubies with identity, position
and orientation, including the side-centre rotations that are visible on a
Fischer Cube and the middle-edge flips that are not. See
[`docs/FISCHER_MODEL.md`](docs/FISCHER_MODEL.md) for the mathematics.

## Run it

Requires Node.js 18 or newer.

```bash
npm install
npm run dev      # development server (http://localhost:5173)
npm run build    # type-check + production build into dist/
npm run preview  # serve the production build
npm test         # full test suite (about 45 s; includes 120 random solves)
```

## Using it

**Hold your puzzle with white on top and the green|red vertical edge pointing
at you.** That is the app's standard orientation. If you hold it differently,
use x / y / z or the Top / Front selectors under the 3D view; this changes only
how you hold the puzzle, and the move instructions follow.

1. **Get your state in.**
   * *Scramble*: type the moves you made (e.g. `R U R' U' F2`) and press
     *Apply moves*, or press *Random scramble* and copy it onto your puzzle.
   * *Enter state → By piece* (recommended for a real puzzle): click a piece on
     the 3D model or pick a position in the list, choose which piece is there
     and twist / flip / rotate it until the screen matches your puzzle.
     Every piece is always used exactly once, so counting mistakes are
     impossible; impossible twists or swaps are explained live.
   * *Enter state → By sticker*: paint the 96-cell mechanism net. Wrong counts,
     non-existent colour combinations, duplicates and blanks are reported and
     the offending pieces are outlined.
2. **Solve.** Pick Quick, Shorter or Shortest and press *Solve this state*. The
   search runs in a Web Worker. You get "Solution found: N moves" only after the
   solution has been replayed on your state and checked.
3. **Follow the steps.** The player shows the move (e.g. `R′`), the step
   counter ("Step 7 / 24"), a sentence ("Turn the Right face counter-clockwise")
   and which centre colours that layer has. The layer is highlighted and an
   arrow shows the direction. Use Previous / Next, Play / Pause, the progress
   bar, or the keyboard (← → and Space).

The *Developer* tab has **Open physical verification**: pick any of the 18
face turns (or step through the test sequence `F R2 U' F`) and see BEFORE and
AFTER in 3D, plus every piece that moved, where it went, its orientation and
the direction each of its stickers faces, and the rotation of every centre.
See [`docs/PHYSICAL_AUDIT.md`](docs/PHYSICAL_AUDIT.md) for the full audit.

The *Developer* tab also shows CP/CO/EP/EO, centre rotations, the sticker string,
move history and a serialisable state, and runs Test move, Inverse test,
Scramble test (N random solves in the worker) and the sticker Round-trip test.

## Project structure

```
src/
  cube/        the model (no UI code)
    geometry.ts      coordinate frame, rotation group, faces, cubie homes
    state.ts         CubeState = one rotation per cubie
    moves.ts         move engine, inverse, whole-cube (view) rotations
    notation.ts      parsing/formatting of standard notation incl. x y z
    fischerShell.ts  ALL Fischer-specific geometry: shell, piece polyhedra,
                     sticker sampling, visibility (symmetries)
    cubies.ts        CP/CO/EP/EO/centre arrays and orientation definitions
    facelets.ts      96-cell sticker net: state ↔ stickers, decoding + errors
    solvedState.ts   Fischer isSolved (+ independent sticker check)
    validation.ts    reachability checks with explanations, hidden-flip handling
    physicalAudit.ts physical description of moves (pieces, stickers, shape, centres)
  solver/
    coordinates.ts   coordinates and move tables (generated from the engine)
    pruning.ts       BFS pruning tables
    search.ts        Fischer two-phase search
    optimizer.ts     move simplification
    validator.ts     replay verification
    solve.ts         pipeline: validate → search → simplify → verify
    worker.ts, client.ts, protocol.ts, selfTest.ts   Web Worker plumbing
  renderer/    three.js view (pieces built from the shell polyhedra)
  input/       scramble generation
  ui/          React components (player, editors, developer panel, view controls)
tests/         vitest: moves, model, solver, regressions
tools/verify_groups.py   sympy group-order checks behind the reachability rules
tools/independent_sim.py independent Python simulation (physical-model oracle)
tools/audit-report.ts    generates docs/PHYSICAL_AUDIT.md
tools/choose-test-sequence.ts  picks the physical test sequence
docs/FISCHER_MODEL.md    model and solver explanation
docs/PHYSICAL_AUDIT.md   layer table, all 18 turns from solved, test sequence, assumptions
```

To model another shape mod on the same mechanism, change `FISCHER_CONFIG` in
`src/cube/fischerShell.ts`; stickers, visibility, solved test and 3D shapes
are all derived from it.

## Test results

`npm test` – all tests in 5 files pass:

* **moves** (15): rotation group, M·M⁻¹ = identity and M⁴ = identity for all 18
  moves on scrambled states (centres included), layer occupancy, known move
  effects, sequence inverses, (R U R' U')⁶ = identity, notation parsing,
  whole-cube rotations (`x U x'` = F, `y R y'` = B, `z U z'` = L).
* **model** (29): derived piece shapes and visibility, standard-3×3 control,
  array/geometry agreement, invariants, Fischer isSolved cases (180° side
  centre: solved on a 3×3, not on a Fischer; invisible E-edge flip and U/D
  centre rotation: still solved), sticker round trips and every decoding error,
  validation of twist, parity, overlaps, moved centres, single flipped edge.
* **solver** (26): coordinate bijections, move tables vs. cubie moves, the
  phase-2 centre/slice invariant, **120 random 25-move scrambles solved and
  verified by replay (average 24.8 moves, max 29)**, short scrambles, every
  single move, rotated side centres (90°/180°/270°), twisted corners, flipped
  edges, a single flipped top edge, edges-all-flipped, checkerboard, already
  solved, refusal of impossible states, optimizer cases.
* **regression** (4): bugs found during development.
* **physical** (independent checks): all 18 turns agree sticker by sticker with
  the separate Python simulation; textbook 3×3 facts fix the clockwise
  convention; known Fischer facts (shape changes, outer corners are edges,
  R2 swaps the R centre); renderer pose, animation end pose and arrow
  direction match the engine; control tests prove the comparison catches a
  reversed direction, a mirrored shell and ignored centres.

To regenerate the oracle and the report: `python3 tools/independent_sim.py`
(needs numpy) and `npx vite-node tools/audit-report.ts`.

`python3 tools/verify_groups.py` (needs sympy, numpy) prints the group orders
used in the docs: full group = |3×3| × 256; phase-2 group = |H| × 8.

## Testing with a physical Fischer Cube

**Quickest check:** from solved, do `F R2 U' F` one move at a time and compare
each step in *Developer → Open physical verification → Test sequence*. At the
end the front centre shows red on the left and green on the right, and the
right centre shows blue in front. Details are in `docs/PHYSICAL_AUDIT.md`,
section 3.

1. Solve your puzzle and hold it white on top, green|red edge towards you.
   The 3D view in *Standard hold* should look the same. If your colour scheme
   differs, rotate the puzzle until it matches, or note the difference – the
   app assumes the standard scheme.
2. **Move check.** Type `R` and press *Apply moves*. Turn the right third of
   your puzzle clockwise (looking at it from the right). Both should match.
   Repeat with `U`, `F`, and a prime move such as `L'`.
3. **Scramble round trip.** Press *Random scramble*, apply the shown moves to
   your puzzle, and compare it with the 3D view piece by piece. Then solve and
   follow the steps. You should end solved.
4. **Entry check.** Scramble your puzzle by hand, enter it with *By piece*,
   press *Validate*, then solve. If validation says a corner is twisted or two
   pieces are swapped, re-check that position – it is almost always an entry
   mistake.
5. **Centre check.** From solved, type `R2` and apply it, and do `R2` on your
   puzzle. On an ordinary 3×3 the R centre would look unchanged; on the
   Fischer Cube its red and blue halves swap sides, and the 3D view shows the
   same. This is why centre rotation is part of the state here.

## Known limitations

* The solver is a time-budgeted two-phase search: solutions are usually 22–27
  moves, but they are not optimal and the app does not claim so. Very hard
  positions (e.g. all edges flipped) can take several seconds for the first
  solution.
* Only face turns (U R F D L B) and whole-cube rotations are supported;
  slice moves (M E S) and wide moves are not.
* The colour scheme is fixed to the standard Western scheme.
* The sticker net describes what you see when looking straight at each
  mechanism layer. On a scrambled Fischer Cube that is awkward, so piece entry
  is the recommended method.
* The puzzle cannot be turned by dragging layers in 3D; turns are made with
  notation, the solution player and the editors.
* The orientation of the four single-colour middle edges and of the top/bottom
  centres cannot be seen, so the app never asks for it; when it must choose one
  internally it says so.
* Fonts load from Google Fonts; offline the app falls back to the system font.
