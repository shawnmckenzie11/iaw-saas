## Agent Behavior
- Always generate an implementation plan Artifact and wait for
  approval before writing code, for any task touching the schema,
  payment/invoice logic, or QuickBooks integration.
- For UI-only or purely cosmetic tasks, plan-and-execute without
  waiting for approval.

## Verification
- After any change to the mobile capture flow, verify in the browser/
  emulator and capture a screenshot Artifact.
- After any change to the QuickBooks mapping logic, run against a
  sandbox/test QuickBooks company only — never production.