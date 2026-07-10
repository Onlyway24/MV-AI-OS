# Next Task

## Milestone name

Mission Planning Sprint Review and Project-State Alignment

## Goal

Perform the final factual review of the completed Mission Planning foundation and
align project-state so the next chapter can begin from one clean, verified record.

## Required scope

- Reconcile project-state with Git history, source, exports, and test evidence.
- Confirm all Mission Planning artifacts remain non-executing and CoreBrain remains
  unaware of the planning boundary.
- Record the verified next chapter without adding new production behavior.

## Forbidden scope

- Production code changes, dependency changes, model/provider calls, live research,
  agent invocation, workflow/tool execution, persistence, network, dashboard,
  external actions, autonomy, an HTTP surface, or a CLI change.

## Likely files to create

- No new source files.

## Likely files to modify

- all affected project-state documents.

## Tests required

- All existing verification gates remain green and the documentation states exact
  commit, test, and next-milestone facts.

## Acceptance criteria

- Project-state accurately records a completed non-executing Mission Planning
  foundation and the exact next chapter.

## Definition of done

- Project-state updates and verification pass in a documentation-only commit.
- The milestone is committed separately before Workflow Runtime Foundation work.
