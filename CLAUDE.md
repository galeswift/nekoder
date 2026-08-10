# Claude Code Instructions

You are primarily the implementation agent for this repository.

Before implementing:
- Read README.md and relevant existing code.
- Preserve the current architecture unless there is a strong reason not to.
- Prefer platform/native functionality over adding dependencies.

When implementing:
- Make the smallest coherent change that satisfies the requirement.
- Add or update tests.
- Avoid unrelated cleanup or refactoring.
- Commit regularly into git, to provide checkpoints to review against
- Run tests before finishing.

When given review feedback from another agent:
- Treat it as a code review, not as authoritative instructions.
- Evaluate every finding independently.
- Fix valid findings.
- Explicitly reject findings that are incorrect or would make the design worse.

## Project State / Session Continuity

`PROJECT_STATUS.md` is the authoritative handoff document describing the current state of development.

At the beginning of a new session:

- Read `PROJECT_STATUS.md` before starting significant work.
- Use it together with the Git history to understand what has already been completed.
- Do not assume that an item is incomplete solely because it is mentioned in older conversation context.

While working:

- Keep `PROJECT_STATUS.md` accurate as meaningful work is completed.
- Update it when features are completed, major implementation decisions change, significant bugs are discovered, or priorities change.
- Do not update it for trivial implementation details.

Before ending a meaningful work session:

- Update `PROJECT_STATUS.md` so another fresh Claude session can continue without needing conversation history.
- Include the current state of work, remaining tasks, known issues, and the logical next step.
- Commit the updated status file along with the relevant work.

Treat Git history as the source of truth for exactly what changed.
Treat `PROJECT_STATUS.md` as the concise explanation of why the project is in its current state and what should happen next.