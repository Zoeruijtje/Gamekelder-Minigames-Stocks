# Continuation Protocol

This repository uses a bounded continuation handoff so each implementation session ends with a precise, testable next objective.

## At the end of every implementation session

1. Finish the current bounded scope; do not leave the active branch knowingly broken.
2. Run the applicable unit, browser, database and security checks.
3. Record completed work and unresolved risks in the pull request or implementation-status document.
4. Replace the contents of `docs/NEXT_SESSION_PROMPT.md` with a self-contained prompt for the next session.
5. Create or update one GitHub issue titled `Next session: ...` containing that prompt and links to the active branch, pull request and failing checks, if any.
6. The next session starts by reading:
   - `README.md`
   - `docs/FULL_IMPLEMENTATION_PLAN.md`
   - `docs/IMPLEMENTATION_STATUS.md`
   - `docs/NEXT_SESSION_PROMPT.md`
   - the active pull request and latest CI results
7. At the end of that next session, repeat this protocol with a new bounded prompt.

## Scheduling limitation

A GitHub issue and `NEXT_SESSION_PROMPT.md` form a durable work queue, but they do not autonomously start a new ChatGPT session. A scheduled execution requires an external automation system that can invoke an agent with repository credentials. The repository must not create a self-triggering workflow that repeatedly modifies code without explicit review, budget controls and a termination condition.

## Prompt requirements

Every continuation prompt must include:

- repository and branch;
- current commit and pull request, when available;
- precise objective;
- required source files and documentation to inspect;
- product and visual constraints;
- security constraints;
- tests that must pass;
- explicit non-goals;
- a definition of done;
- an instruction to generate the following continuation prompt after completing the scope.

## Review gates

A continuation session may open a pull request after tests pass. It must not merge changes that alter authentication, Row Level Security, financial calculations, settlement logic or deployment configuration without a green CI run and a reviewable summary.
