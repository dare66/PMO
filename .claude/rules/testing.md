# Testing rules
- Add an integration test for each new rule (permission, validation, workflow effect) against real Postgres.
- Never claim tests pass without running them; paste results into docs/testing/TEST_EVIDENCE.md when cutting a release.
- Do not skip or disable tests to get green.
