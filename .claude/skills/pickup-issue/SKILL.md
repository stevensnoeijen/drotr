---
name: pickup-issue
description: "Pick up and start work on a GitHub issue (ticket) in stevensnoeijen/drotr from its number or URL, e.g. '85' or https://github.com/stevensnoeijen/drotr/issues/85. Fetches the issue, classifies its complexity, creates the branch per repo convention, moves the Project status to 'doing', and hands the actual implementation off to a subagent whose model and effort are chosen to match the ticket. Triggers on: pick up issue, work on issue, start ticket, implement issue #N, take on issue."
license: MIT
---

# Pick up a GitHub issue

Given an issue id or URL, get an up-to-date branch created, the Project
status moved to "doing", and a subagent dispatched to implement the ticket —
sized to the ticket instead of always reaching for the biggest model.

Run this skill itself cheaply: it's just fetching metadata, classifying, and
delegating. Don't do the implementation work in this top-level context.

## 1. Resolve the issue number

Accept either a bare number (`85`) or a full URL
(`https://github.com/stevensnoeijen/drotr/issues/85`). Extract the trailing
integer.

## 2. Fetch the ticket

```
gh issue view <number> --repo stevensnoeijen/drotr \
  --json number,title,body,labels,milestone,url
```

Read the body in full — acceptance criteria and scope live there, and drive
both the classification in step 3 and the brief you hand to the subagent in
step 5.

## 3. Classify model + effort

There are no size/complexity labels in this repo (checked — only
`type:feature`, `type:chore`, `type:research`, plus the stock GitHub set).
Classify from the label, milestone phase, and body content instead:

| Signal | Model | Effort instruction to bake into the subagent prompt |
|---|---|---|
| `type:chore`, mechanical/well-scoped (config, CI, rename, single-file cleanup) | `sonnet` | "Small, well-defined change — move quickly, keep the diff minimal, don't over-engineer." |
| `type:feature`, ordinary scope within one milestone phase (one system/component, e.g. add a component to an existing ECS system) | `sonnet` | "Standard-scope feature — implement carefully, write tests per CLAUDE.md, but no need for extended design exploration." |
| `type:feature` spanning multiple systems, introducing new architecture, or in a parallel/asset-pipeline milestone (phase 5+) | `opus` | "Cross-cutting or architecturally significant — think through the design and edge cases before writing code, and check how it fits existing systems." |
| `type:research` (reverse-engineering, format decoding, investigation) | `opus` | "Research ticket — the outcome is understanding/a document, not just code. Be thorough, verify claims against primary sources (hex dumps, existing decoders, etc.), and don't guess." |
| Body uses words like "investigate", "figure out", "explore approaches", "design", or scope is ambiguous/underspecified | `opus` | "Scope is ambiguous — clarify the approach (in the PR description or by asking) before committing to an implementation." |
| Anything else / doesn't clearly match above | `sonnet` | "Default scope — implement per the ticket and repo conventions." |

Pick the first row that matches. When in doubt between two rows, prefer the
cheaper one (`sonnet`) — the ticket body is the source of truth, not this
table; use judgment if the milestone or labels point somewhere the table
doesn't cover.

## 4. Prep the branch and Project status

- Confirm `main` is up to date (`git fetch origin main`), then create
  `<issue-number>-<kebab-slug-of-title>` off it, per CLAUDE.md.
- Move the issue's GitHub Project status to "doing" (`gh project item-edit`
  or the equivalent for however this repo's Project is set up — check with
  `gh project list`/`gh issue view --json projectItems` if unsure).

These two steps happen in the top-level context, not the subagent, since
they're one-shot metadata operations, not implementation work.

## 5. Dispatch the subagent

Use the `Agent` tool, `subagent_type: "claude"` (needs full tool access —
this subagent will write code, run tests, and open a PR), with `model` set
per step 3.

The subagent starts with no context, so the prompt must be self-contained:

- Full issue title, body, number, URL, labels, milestone.
- The branch already exists and is checked out — tell it so, and tell it not
  to create another one.
- Point it at CLAUDE.md's "Working on tickets" section for the check suite
  (`npm run build`, `npm run typecheck`, `npm run lint`, `npm test`) and PR
  requirements (`Closes #<number>`, small/focused).
- The effort instruction from the table in step 3.
- Tell it to move the Project status to "done" once the PR is opened and
  merged is out of scope for it — per CLAUDE.md that happens on merge, not
  on PR open, so leave status at "doing" and mention this in its final
  report rather than flipping it itself.
- Tell it explicitly to stop after committing locally and getting the check
  suite green, and NOT to `git push` or `gh pr create` on its own — pushing
  a branch and opening a PR are visible, hard-to-reverse actions and need
  the user's explicit go-ahead first, even though the rest of the ticket is
  delegated. It should report back with the finished, locally-committed
  work and wait.
- Tell it that its last step, after the implementation is otherwise
  finished and the check suite is green but **before it reports back as
  done** (i.e. before any PR gets created from this work — that's the
  whole point of doing it last), is the ticket-id-reference check below.

### Last step before the PR: check for references to this ticket

Per CLAUDE.md, code may reference a *future* ticket id (`#<this ticket's
number>`) as a marker for work this ticket now completes. Bake this into
the subagent's instructions as its final action:

- Grep the codebase for `#<issue-number>` (e.g. `grep -rn '#<number>\b'
  src/`).
- For each hit, decide:
  - The ticket is now fully implemented at that spot — remove the
    reference (and, per CLAUDE.md, don't replace it with a new ticket-id
    citation — rewrite the rationale in prose if it's still needed).
  - The hit reveals scope the ticket didn't cover — do **not** silently
    implement or silently leave it. Ask the person in charge: surface it in
    its final report, quoting the comment and pointing out where the
    ticket's description doesn't cover it, rather than guessing which way
    to resolve it.
- Only once this check is done (references resolved or flagged) does the
  subagent report back as finished — this is what "done" means before a PR
  is created from this work.

## 6. Report back

Summarize for the user: issue number/title, branch name, model/effort
chosen and why, and that the subagent is running (agent id/name so it can be
resumed via `SendMessage` if the user wants to check progress later).

## 7. Push and open the PR only after approval

When the subagent reports back with the implementation done and checks
green, confirm its report covered the ticket-id-reference check from step 5
(references removed, or flagged questions surfaced) — if it didn't, send it
back to do that before proceeding. Do not push or open the PR yourself
either. Show the user a summary
of what it did and explicitly ask for approval to push the branch and open
the PR. Only run `git push`/`gh pr create` (or resume the subagent to do so)
after they confirm.
