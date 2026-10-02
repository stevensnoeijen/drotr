---
name: plan-tickets
description: "High-level ticket planning for stevensnoeijen/drotr: research the codebase, propose how to split a feature idea, a too-big issue, a parent issue or a whole milestone into small tickets that each deliver a change, confirm the plan with the user, then create or update the parent issue and outline sub-issues with their order, dependencies and Project Status, Model and Effort. Detailed per-ticket specs are left to refine-ticket. Triggers on: plan tickets, plan a feature, ticket planner, split issue #N, break down issue #N, create tickets for, re-plan #N, groom milestone, plan milestone."
license: MIT
---

# Ticket planning

Turn a piece of intended work into a set of GitHub issues that are each small
enough for one focused PR and each deliver a change, agreed with the user
before anything is written to GitHub.

This is the **high-level** pass. It decides *which* tickets exist, what each
one delivers, how the work is split, and the order and dependencies between
them. Each ticket is written as an outline, not a full spec. The other ticket
skills take over from there:

- **refine-ticket** turns one outlined ticket into a detailed spec: the
  approach, the scope checklist, edge cases and tests. Every ticket this
  skill creates goes through it before implementation.
- **implement-ticket** implements one refined ticket.

So leave implementation-level decisions (how to build something inside a
ticket, edge cases, test coverage) out of this skill. Capture them in the
ticket's open questions for refine-ticket instead. This skill never writes
code, creates branches or starts implementation.

## The one hard rule: never assume, always confirm

Nothing is created, edited, re-parented or closed on GitHub until the user
has explicitly confirmed the plan (step 6). Every point where the work is
ambiguous, underspecified or has more than one reasonable split is a
question for the user, never a silent default. Don't ask what the research
already answers definitively. Ask everything that is genuinely the user's
call.

If the user changes the plan at any point, show the changed plan again and
get a fresh confirmation. An earlier "yes" does not cover a plan that has
since changed.

## Where this runs

Run the planning conversation in the **top-level context**: the user is in the
loop for the whole skill, so keep the back-and-forth where it's cheapest for
them. Hand the heavy codebase research to a subagent (step 3) so its file
dumps stay out of this context. Only the findings come back.

## 1. Identify the starting point

The skill accepts four kinds of input. Work out which one it is. If it's
unclear, ask.

| Input | Example | What to fetch |
|---|---|---|
| Free-form idea | "add fog of war" | Search existing issues for overlap (step 2). Nothing else yet. |
| Existing too-big issue | `242`, or an issue URL | That issue, its parent and any sub-issues. |
| Parent issue to re-plan | `171` | The parent, plus every sub-issue with state, body and Project fields. |
| Milestone to groom | "phase 3" | Every open issue in that milestone (see below). |

Fetch an issue with its relationships:

```
gh issue view <number> --repo stevensnoeijen/drotr \
  --json number,title,body,labels,milestone,url,state,parent,subIssues,blockedBy,blocking,comments
```

`subIssues`, `blockedBy` and `blocking` are objects. Read `.nodes[]` from them.

Read an issue's Project fields (Status, Model, Effort, plus the item id
needed to change them in step 8):

```
gh api graphql -f query='{repository(owner:"stevensnoeijen",name:"drotr"){issue(number:<number>){projectItems(first:5){nodes{id project{number} fieldValues(first:20){nodes{... on ProjectV2ItemFieldSingleSelectValue{name field{... on ProjectV2SingleSelectField{name}}}}}}}}}}'
```

Use the item whose `project.number` is 3.

For a milestone:

```
gh api repos/stevensnoeijen/drotr/milestones?state=all \
  --jq '.[] | "\(.number) \(.state) \(.title)"'
gh issue list --repo stevensnoeijen/drotr --milestone "<title>" --state open \
  --limit 200 --json number,title,body,labels
```

## 2. Gather context (top level, cheap)

- Find the roadmap phase in CLAUDE.md ("Roadmap awareness") that the work
  belongs to. A plan must not depend on a capability from a later phase that
  doesn't exist yet.
- Search for overlapping or duplicate issues, open and closed:
  `gh issue list --repo stevensnoeijen/drotr --state all --search "<keywords>" --limit 30`.
  Existing tickets that already cover part of the work get reused or edited,
  never duplicated.
- Look for prior art in history: `git log --oneline --grep "<keyword>"`. Read
  one or two past parent issues with sub-issues (e.g. `gh issue view 171`) to
  see how this repo splits work.

## 3. Research the codebase (subagent)

Dispatch one research subagent:

- `Agent` tool, `subagent_type: "Plan"` (read-only, can run `gh` and read the
  codebase), `model: "opus"`.
- The prompt must be self-contained: the work being planned (issue bodies or
  the user's description verbatim), the roadmap phase, and the overlapping
  issues found in step 2.
- Tell it the research is for deciding **how to split the work**, not for
  specifying each ticket in detail (that's refine-ticket's job later). It
  reports **findings, not a finished plan**, separating what it verified
  from what it inferred:
  - Which systems and areas the work touches, with real paths and rough
    sizes ("~40 call sites across 9 files, e.g. …").
  - Existing seams the work can attach to, and any refactor it needs first.
  - Natural split points: a data contract, pure logic that can be unit
    tested without PixiJS, pipeline vs. runtime, one unit type end-to-end
    vs. all of them.
  - How each candidate slice could be verified on its own: a unit test, a
    `/game?scenario=…` scenario, a script output.
  - Dependencies on open tickets or on capabilities from later roadmap phases.
  - Unknowns that can't be resolved without investigation (candidates for a
    `type:research` ticket).
- Tell it not to talk to the user and not to write anything to GitHub or the
  working tree.

For a milestone groom with several unrelated clusters of issues, one research
subagent per cluster is fine. Run them in parallel.

## 4. Design the split

Use the research to draft the tickets. Principles, in order of priority:

**Every ticket delivers a change.** After its PR merges, something is
observably different and verifiable on its own: behaviour in the game
(ideally a `/game?scenario=…` view), a script that produces output, a tool or
CI change that runs. Prefer vertical slices that go end to end for one case
first (one unit type, one map) and widen afterwards, over horizontal layers
that only add up to something at the end.

**Size each ticket for one small, focused PR** (CLAUDE.md: one ticket, one
branch, one PR). Signals that a ticket is too big:

- It touches several systems that each carry their own risk.
- It needs more than one design decision that could reasonably go either way.
- It mixes investigation with implementation, or a refactor with a feature.
- What it delivers can't be verified in one review sitting.

Signals that a ticket is too small: it has no value of its own and nothing
gained by separating it. Merge it into its neighbour.

**Dead code is allowed only when the change is too big to deliver in one
ticket.** Then a ticket may land code that nothing uses yet, such as a typed
contract or pure, tested logic that a follow-up ticket wires in. That's fine
as long as all of these hold:

- The consumer ticket(s) are part of the **same plan** and get created in
  the same pass, so the dead code has a known, near-term user.
- The dead-code ticket ships with unit tests, so it's verified on its own
  even though nothing calls it yet.
- Its body says so explicitly under **Consumed by:** with the consumer
  ticket number(s), and the consumer's body has it under **Blocked by:**.
- The order puts the consumer soon after it, not at the end of a long chain.
- The plan says why the work can't be delivered as a working change instead.

Prior art: the sprite contract and the animation-key derivation tickets
under #171 both landed unused, tested code that the renderer ticket then
wired in.

Prefer a behaviour-preserving prep refactor ticket ("no behaviour change,
existing tests still pass") over a dead-code ticket when the split is about
making room for the change.

**Unknowns get a `type:research` ticket first.** Its outcome is a document or
a decision. Plan the follow-ups that depend on it only as far as the research
can't change them. Say in the plan which follow-ups are provisional and will
be re-planned once the research lands.

**Stay in phase.** Each ticket gets the milestone of the roadmap phase it
belongs to. If the work needs something from a later phase, flag it to the
user instead of planning around it.

**Group under a parent issue** whenever the plan has more than one ticket,
the way #159, #170 and #171 do. The parent is a tracking issue: what the work
achieves, the overall approach, and the order of work as a dependency
diagram. A one-ticket plan has no parent. If the work fits an existing
parent, add to it rather than creating a new one.

**Propose Model and Effort per ticket.** CLAUDE.md requires them on every
issue from creation, so set them from the ticket's planned scope using the
classification table in `implement-ticket` step 3. Use the newest version
option of the chosen family that the Project's `Model` field offers (check
with `gh project field-list 3 --owner stevensnoeijen --format json`).
refine-ticket re-sets them once it has settled the ticket's detailed scope.

### For a milestone groom

Triage every open issue in the milestone into one of:

- **ready**: scoped, one PR, delivers a change. No action.
- **needs refinement**: right size and clear place in the plan, but the body
  doesn't say what to build. Not changed here. List it for refine-ticket in
  the report.
- **too big**: gets split per the principles above.
- **duplicate / superseded / out of phase**: propose closing, merging or
  moving to another milestone.
- **missing**: work the milestone's goal needs that no issue covers.

Present the triage table first and let the user choose which issues to plan
now. Then run steps 4–8 per issue or cluster, so each confirmation stays a
reviewable size.

## 5. Propose the plan

Present the plan in chat. Keep it scannable, not a wall of prose:

1. **Summary**: what the work achieves and the split strategy in two or
   three sentences.
2. **Dependency diagram** in a code block, like the one in #171's body.
3. **Ticket table**, one row per ticket: placeholder id (`T1`, `T2`, … for
   new tickets, `#N` for existing ones), title, label (`type:feature`,
   `type:chore` or `type:research`), milestone, what it delivers and how it's
   verified, blocked by, dead code? (and consumed by), proposed Model/Effort.
4. **Changes to existing issues** (re-plan and groom only): edits,
   re-parenting, closures, milestone moves. Each one says why.
5. **Open questions**: every planning decision that is the user's call.

Then ask the open questions with `AskUserQuestion`. Ground every option in
what the research found (real files, counts, tradeoffs), never an abstract
choice. Always cover, where it applies:

- **Scope**: what the work as a whole includes, and which tickets are out of
  this plan.
- **Split**: where the split points are, especially any dead-code ticket and
  why it can't deliver a working change.
- **Order**: what goes first and what can run in parallel.
- **Status** for the new tickets: `Backlog` or `todo`. Ask this every time,
  for each plan.

Don't ask implementation-level questions here. Note them per ticket as open
questions for refinement (step 7).

Fold the answers into the plan and show the updated plan.

## 6. Confirm, twice

1. **Plan**: once the user has approved the plan from step 5, draft the body
   of every new or edited ticket (format in step 7).
2. **Ticket texts**: show the drafted bodies to the user. They are what
   refine-ticket starts from, so check that every goal, deliverable and
   scope boundary is one the user agreed to. Get an explicit go-ahead on
   them.

Only after the second confirmation, move on to writing to GitHub. If the user
asks for changes, apply them and show the changed parts again.

## 7. Ticket body format

Each ticket is an outline: enough to know what it delivers, where its
boundaries are, and what refine-ticket has to work out. Don't write a scope
checklist, approach or test plan here, and don't invent anything the user
didn't agree to.

```markdown
**Goal:** <one or two sentences: what changes and why>

**Delivers:** <the observable change once merged, and how it's verified,
e.g. `/game?scenario=test-…` shows …>

**Scope:** <what's in, at the level of systems/areas the research found>

**Out of scope:** <what belongs to sibling tickets, by number>

**Research notes:**
- <findings from step 3 relevant to this ticket: paths, sizes, seams>

**Open questions for refinement:**
- <implementation-level questions left for refine-ticket>

**Blocked by:** #N, #M
**Consumed by:** #N   ← dead-code tickets only

Part of #<parent>.

_Outline from ticket planning. Run refine-ticket before implementing._
```

Leave out sections that don't apply. For example, a research ticket's
deliverable is a document, so its **Delivers** names the document rather
than an in-game check.

The parent body follows the shape of #171: what the work achieves, any
measured facts the research established, the overall approach, and an
**Order of work** section with the dependency diagram and numbered order,
using real issue numbers.

## 8. Write to GitHub

Draft every body in the scratchpad directory, using the placeholder ids
(`T1`, `T2`, …) for tickets that don't exist yet. Then:

1. **Create the parent first** (if the plan has a new one):
   ```
   gh issue create --repo stevensnoeijen/drotr --title "<title>" \
     --body-file <file> --milestone "<milestone>" --project drotr
   ```
2. **Create the sub-issues in dependency order**, blockers first, so
   `Blocked by` references point at real numbers:
   ```
   gh issue create --repo stevensnoeijen/drotr --title "<title>" \
     --body-file <file> --label "<type:…>" --milestone "<milestone>" \
     --project drotr --parent <parent number>
   ```
   Keep a placeholder → number map as you go.
3. **Resolve the forward references.** Replace every remaining placeholder
   (`Consumed by`, `Out of scope`, the parent's diagram and order) with real
   numbers and update those bodies with `gh issue edit <n> --repo
   stevensnoeijen/drotr --body-file <file>`.
4. **Add the native dependencies** to match the `Blocked by` lines:
   `gh issue edit <n> --repo stevensnoeijen/drotr --add-blocked-by <m>`.
5. **Apply the confirmed changes to existing issues**: `gh issue edit` with
   `--body-file`, `--parent` / `--remove-parent`, `--milestone`, and
   `gh issue close <n> --reason "not planned" --comment "Superseded by #<m>"`
   for confirmed closures. Nothing that wasn't in the confirmed plan.
6. **Set the Project fields** on every created or edited ticket: `Status`
   (as the user chose in step 5, new tickets only. Leave existing tickets'
   status alone unless the plan said otherwise), `Model` and `Effort`. Get
   the field and option ids, then the item id (from the step 1 query), and
   set each field:
   ```
   gh project field-list 3 --owner stevensnoeijen --format json
   gh project item-edit --project-id PVT_kwHOACn4J84AD6UC --id <PVTI_…> \
     --field-id <field id> --single-select-option-id <option id>
   ```
   A parent tracking issue only gets `Status`, since it is never implemented
   itself.

If any command fails partway through, stop and tell the user exactly which
tickets were created or changed and which weren't. Don't retry into
duplicates.

## 9. Verify and report

Re-fetch the parent with `--json subIssues` (or each ticket for a groom) and
check that every planned ticket exists, sits under the right parent, and has
its milestone, label and Project fields set.

Report to the user:

- Links to the parent and every created or edited ticket, in order of work.
- Model/Effort/Status per ticket.
- Which ticket(s) can start now (nothing blocking them). The next step for
  each is `refine-ticket <number>`, then `implement-ticket <number>`.
- For a groom: the issues triaged as needing refinement.
- Any provisional tickets that will need re-planning once a research ticket
  lands.

Don't refine or implement anything yourself.
