# Workspace Guidelines & Rules

## Git Workflow & Push Restrictions

### ⛔ STRICT RULE: No Automatic or Autonomous Pushes to Remote (`main` or any branch)
1. **Never push to `main` (or any remote branch) without explicit user permission.**
2. Under no circumstances should `git push`, `git push origin main`, or any remote push commands be executed automatically.
3. When changes are made, tested, and committed locally:
   - Always notify the user of the committed changes.
   - Explicitly ask the user for permission before running `git push`, OR only push when the user explicitly instructs: "push to main" or "push the changes".
