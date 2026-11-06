---
name: run-regression
description: Run the full regression suite and record evidence
---
Start Postgres, run backend tests (verbose), typecheck backend and frontend, build frontend, run docker compose and the screenshot script. Record exact outputs in docs/testing/TEST_EVIDENCE.md. If anything fails, report it plainly with output.
