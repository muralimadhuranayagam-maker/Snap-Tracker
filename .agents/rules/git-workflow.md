---
trigger: always_on
description: Prohibits pushing to main or remote branches without explicit user permission.
---

# Git Push Permission Rule

- **Do NOT push to `main` or any remote branch without explicit user permission.**
- Always prompt the user or wait for an explicit command (e.g., "push to main") before running `git push`.
- Local commits and testing are allowed, but remote publishing/pushing must always be approved by the user first.
