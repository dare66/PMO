---
name: review-frs
description: Import or review FRS requirements and regenerate the Master FRS and traceability matrix
---
1. Read the source FRS fully (docx via a docx reader). Extract IDs, workflows, roles, entities, acceptance criteria, NFRs, assumptions.
2. For each, set baseline_id and classify Retained/Enhanced/Expanded/Replaced/Deferred/Rejected (justify the last two/three) in docs/requirements/requirements_source.py.
3. Add missing requirements with new FR-<MODULE>-NNN IDs; never renumber existing IDs.
4. Run `python3 docs/requirements/requirements_source.py`; update REQUIREMENT_GAP_REGISTER.md.
