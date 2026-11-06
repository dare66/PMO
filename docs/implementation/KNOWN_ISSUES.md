# Known issues & limitations
- KI-01 FRS v1.1 not imported (GAP-000).
- KI-02 Single-node job scheduler (ADR-0004).
- KI-03 Planned value uses a linear curve between baseline dates (no cost-loaded schedule).
- KI-04 Search uses ILIKE; no full-text ranking yet.
- KI-05 Dependencies record ids rather than pickers for heterogeneous targets in the UI form.
- KI-06 Work-item Gantt shows only items with start and due dates.
- KI-07 Integrations other than the generic webhook are MOCK.
- KI-08 Saved views are per browser (localStorage), not shared.
- KI-09 Frontend bundle ~840 kB (gzip 236 kB); code-splitting planned.
