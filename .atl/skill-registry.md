# Skill Registry

**Delegator use only.** Any agent that launches sub-agents reads this registry to resolve compact rules, then injects them directly into sub-agent prompts. Sub-agents do NOT read this registry or individual SKILL.md files.

See `_shared/skill-resolver.md` for the full resolution protocol.

## User Skills

| Trigger | Skill | Path |
|---------|-------|------|
| Structure commits as deliverable work units | work-unit-commits | /home/arrua/.config/opencode/skills/work-unit-commits/SKILL.md |
| Write warm, direct, human comments for PRs/issues/reviews | comment-writer | /home/arrua/.config/opencode/skills/comment-writer/SKILL.md |
| PR creation workflow following issue-first enforcement | branch-pr | /home/arrua/.config/opencode/skills/branch-pr/SKILL.md |
| Issue creation workflow following issue-first enforcement | issue-creation | /home/arrua/.config/opencode/skills/issue-creation/SKILL.md |
| Parallel adversarial review protocol | judgment-day | /home/arrua/.config/opencode/skills/judgment-day/SKILL.md |
| RBAC protection enforcement for UI↔Backend consistency | rbac-protection | /home/arrua/.config/opencode/skills/rbac-protection/SKILL.md |
| Feature Flags SDK multi-framework | featurefly | /home/arrua/.config/opencode/skills/featurefly/SKILL.md |
| Split large changes into chained/stacked PRs | chained-pr | /home/arrua/.config/opencode/skills/chained-pr/SKILL.md |
| Design docs with low cognitive load | cognitive-doc-design | /home/arrua/.config/opencode/skills/cognitive-doc-design/SKILL.md |

## Compact Rules

Pre-digested rules per skill. Delegators copy matching blocks into sub-agent prompts as `## Project Standards (auto-resolved)`.

### work-unit-commits
- Commit by work unit (deliverable behavior/fix/docs), NOT by file type
- Tests belong in the same commit as the behavior they verify
- Each commit should be a candidate chained PR when change grows
- If SDD tasks forecast >400-line change, group into chained PR slices before implementation
- Commit message explains the outcome, not the file list

### comment-writer
- Start with the actionable point; no PR recap before feedback
- Sound like a thoughtful teammate, not a corporate bot
- Prefer 1-3 short paragraphs or a tight bullet list
- Give technical reason when asking for a change
- Match thread language (Rioplatense Spanish/voseo if Spanish)
- No em dashes — use commas, periods, or parentheses

### branch-pr
- Every PR MUST link an approved issue — no exceptions
- Every PR MUST have exactly one `type:*` label
- Branch naming: `type/description` — lowercase, no spaces, only `a-z0-9._-`
- Automated checks must pass before merge is possible

### issue-creation
- Blank issues are disabled — MUST use a template
- Every issue gets `status:needs-review` automatically
- Maintainer MUST add `status:approved` before any PR can be opened
- Questions go to Discussions, not issues

### judgment-day
- Launch TWO blind judge sub-agents in parallel via `delegate`
- Neither agent knows about the other — no cross-contamination
- Confirmed issues (both judges) → fix immediately
- Suspect issues (one judge) → needs triage
- Escalate after 2 iterations if judges still disagree

### rbac-protection
- SAME permission slug must protect the SAME flow in BOTH UI and Backend
- Permission format: `resource:action` (actions: manage, create, update, delete, view)
- `resource:manage` implies ALL actions for that resource
- `system:manage` ONLY grants `system:*` (NOT blanket admin)

### featurefly
- Multi-framework feature flags SDK: React, Vue, Node.js, Edge
- Typed TypeScript with exported types
- Resilient: circuit breaker, retry with backoff, cache, fallbacks
- Real-time: SSE streaming for instant updates
- A/B Testing: MurmurHash3 deterministic bucketing

### chained-pr
- Split PRs that exceed 400 changed lines into chained/stacked PRs
- Protect reviewer focus with reviewable slices
- Each slice must be independently reviewable and mergeable

### cognitive-doc-design
- Use progressive disclosure, chunking, signposting, tables, checklists
- Prefer recognition over recall
- Trigger: guides, READMEs, RFCs, onboarding docs, architecture docs

## Project Conventions

| File | Path | Notes |
|------|------|-------|
| AGENTS.md | /home/arrua/.config/opencode/AGENTS.md | Global agent instructions |

Read the convention files listed above for project-specific patterns and rules. All referenced paths have been extracted — no need to read index files to discover more.
