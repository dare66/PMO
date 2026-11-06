# ADR-0003 – Native, data-driven gate/approval engine (no external BPM engine)
**Status:** Accepted · **Date:** 2026-11-06
**Context:** Need configurable lifecycles with entry/exit criteria, parallel/conditional approvals, delegation, rounds and exceptions. Camunda 8 self-managed requires a production licence since 8.6 (S42); Camunda 7 is community-forked.
**Decision:** Workflow definitions stored as versioned JSON stages in `workflow_definitions`; a small criteria vocabulary evaluated server-side; approvals in `approvals` with an authority matrix.
**Consequences:** no licence dependency, transactional with domain data, easy audit. Not a general BPMN executor – BPMN is used for *modelling* business processes, not for running platform workflows. Revisit if long-running orchestration across external systems becomes a requirement.
