# Data & reporting rules
- Business tables carry org_id, code, status, owner_id, classification, audit fields, row_version, deleted_at.
- Never default missing metrics to 0 or green; document every metric in `metric_definitions` (formula, source, refresh, owner).
- Synthetic data only via `SEED_DEMO`, in an organisation flagged `is_synthetic`.
- Documents generated from data must mark missing values and cite sources.
