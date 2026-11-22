# push-solver

Entry for sokoban-solver-01. Splits a level into the independent rooms its boxes can reach and solves each push-optimally
with A* over pushes (so the total is P*, the full score). Deterministic: the search is capped by states, never the clock.

Local run: `MAKEFUN_INPUT_DIR=practice/input MAKEFUN_OUTPUT_DIR=out node main.ts`
