---
name: refine-ticket
description: "Refine a GitHub issue (ticket) in stevensnoeijen/drotr before implementation: fetch it, research the codebase for what it actually requires, then question the user to build an approved, adjustable implementation plan instead of guessing — and write that plan into the issue description. Triggers on: refine issue, refine ticket, flesh out issue #N, scope issue #N, plan issue #N, ticket refinement."
license: MIT
---

# Ticket refinement

Given an issue id or URL, turn a thin or ambiguous ticket into one with a
description that accurately says what will be built and how — agreed with
the user first, never guessed.

This is a *planning* skill, not an implementation one. Don't write code or
open branches here — that's `pickup-issue`'s job, and it can run afterward
once the ticket is refined.

Also use this skill to **re-refine** an already-refined ticket whose scope
changed (new requirement surfaced, user redirected the approach, etc.). Same
flow: re-research against the new reality, ask what changed, rewrite the
issue body, and re-set Model/Effort — don't hand-edit the issue or the
Project fields directly, so the plan and the fields never drift apart.

Run step 1 (resolving the issue number) cheaply in the top-level context,
then hand steps 4–9 to a subagent per step 2 below — don't do the research
and questioning yourself in the top-level context.

## 1. Resolve the issue number

Accept either a bare number (`214`) or a full URL
(`https://github.com/stevensnoeijen/drotr/issues/214`). Extract the trailing
integer.

## 2. Dispatch a subagent to do the refinement

Refinement's entire job is resolving ambiguity — grounding real tradeoffs in
codebase research and judging what's genuinely the user's call. That's the
same "ambiguous/architectural" case `pickup-issue`'s classification table
maps to `opus`, so always use it here too, regardless of how the ticket
looks before refinement (that's the point — it hasn't been scoped yet, so
there's nothing to classify from):

- `Agent` tool, `subagent_type: "claude"` (needs full tool access — `gh`,
  grep/read over the codebase, and `AskUserQuestion` to talk to the user
  directly), `model: "opus"`.
- Effort instruction to bake into the prompt: "High effort — this is the
  scoping pass a later implementation depends on, so research thoroughly
  before asking anything, and make sure each question is grounded in real
  files/counts/tradeoffs, not abstract. Don't rush to close it out."
- Give it the issue number/URL from step 1 and point it at this skill's
  steps 4–9 below to execute (it starts with no context, so include the
  actual steps in the prompt, not just a reference to "this skill").
- It talks to the user itself via `AskUserQuestion` (step 6, including the
  confirm-before-writing part) — that's expected; the whole point of
  delegating is still to get user-approved output, not to remove the user
  from the loop.
- After it reports back with the issue refined and fields set, relay its
  summary to the user in your own top-level report — don't just forward its
  raw output verbatim.

## 4. Fetch the ticket

```
gh issue view <number> --repo stevensnoeijen/drotr \
  --json number,title,body,labels,milestone,url
```

If the body is empty or thin (common in this repo — see #214), the title is
the only signal; don't invent acceptance criteria to fill the gap.

## 5. Research before asking

Before bringing anything to the user, ground the ticket in what's actually
in the codebase: grep for what it refers to, check how big/scattered the
affected area is, look for prior art (similar past tickets/PRs via
`git log --oneline --grep`), and check the milestone phase in CLAUDE.md's
roadmap section so questions don't propose something out of phase.

The goal of this step is to arrive at the questions with real numbers and
examples (e.g. "I found ~80 matches across N files, here are three
representative ones") instead of asking abstractly.

## 6. Question the user — never guess

Any point where the ticket is ambiguous, underspecified, or has more than
one reasonable implementation approach, ask. Use `AskUserQuestion` with
concrete options grounded in what step 5 found (real file examples, real
counts, real tradeoffs) — never a context-free abstract choice.

Cover, as applicable to the ticket:
- **Scope**: exactly what's in/out.
- **Approach**: when multiple implementations are reasonable, lay out the
  real options found in the codebase, not hypothetical ones.
- **Edge cases**: anything step 5's research surfaced that doesn't fit the
  main-line answer cleanly — ask about it explicitly rather than picking a
  default silently.
- **Delivery shape**: one PR vs. split into several, if scope is large.

Keep the plan adjustable: after the user answers, summarize the resulting
plan back to them in plain terms before writing anything, and give them a
chance to redirect. Only proceed to step 7 once the plan is confirmed.

Don't ask questions step 5's research already answers definitively — only
ask what's genuinely the user's call.

## 7. Write the plan into the issue

Once agreed, update the issue body (`gh issue edit <number> --body-file
<tmpfile>`) so it reflects the finalized plan: problem statement, scope
(in/out), the approach and any decided edge-case handling, and delivery
shape. This becomes the source of truth a later `pickup-issue` run (by this
session or a subagent) implements from — write it so a subagent with no
other context could pick it up correctly.

Keep the tone factual/spec-like, not a transcript of the Q&A.

## 8. Set the Project Status, Model, and Effort fields

Per CLAUDE.md, once a ticket's scope is substantively set (initially or on a
re-refinement), its Project `Model` and `Effort` custom fields should
reflect that scope — set them every time this skill finishes, even if it's
just confirming the existing values are still right. Classify using the
same table `pickup-issue` step 3 uses, based on the now-finalized plan
rather than the original thin ticket. If the ticket hasn't been picked up
yet, also move Status to "doing" only if the user says work is starting now
— otherwise leave Status alone (refining isn't starting the work).

To find the field/option ids for this repo's project (`drotr`, project
number 3, owner `stevensnoeijen`):

```
gh project field-list 3 --owner stevensnoeijen --format json
gh project item-list 3 --owner stevensnoeijen --format json --limit 200
```

then set with `gh project item-edit --project-id <PVT_...> --id <PVTI_...>
--field-id <field id> --single-select-option-id <option id>`, once per
field.

## 9. Report back

Tell the user the issue is refined (or re-refined), link it, note the
Model/Effort values set and why, and mention that `pickup-issue` can now
pick it up whenever they're ready — don't start implementation yourself.
