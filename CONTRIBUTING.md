# Contributing

This repository is [prasalitis/job-application-assistant](https://github.com/prasalitis/job-application-assistant), a fork of [MadsLorentzen/ai-job-search](https://github.com/MadsLorentzen/ai-job-search). Both are real, active projects with different goals, and this file exists to make that difference explicit rather than let visitors assume this repo follows upstream's policy by default.

## Two different projects now, by design

**Upstream is a universal template.** Its entire contribution policy is built around one rule: stay market-agnostic, person-agnostic, and single-harness, so that anyone can fork it and get a clean, minimal base. That's why upstream declines country-specific portal skills ("no principled stopping point"), declines a second agent-harness port alongside Claude Code ("the markdown specs ARE the implementation; a second copy drifts the moment either changes"), and keeps personal profile data out of the tree entirely, enforced by CI. Those are good rules — for a template meant to be forked by strangers who each want their own clean starting point.

**This fork is a working instance, not a template.** It's one person's real, populated job search tool, kept public for transparency and so the architectural decisions below are reusable by anyone who wants them — not because it's trying to stay a minimal base other people fork blindly. Concretely, it does several things upstream's policy explicitly declines:

- **Both Claude Code and Mistral Vibe are first-class**, not just Claude Code. `.claude/commands/` and `.agents/skills/` mirror each other deliberately — the exact "alternative-harness port" upstream's policy rules out for itself, because upstream is right that two independently-maintained copies drift, but here both copies are kept in sync as part of normal maintenance rather than being a one-off contribution nobody owns afterward.
- **Country-specific portal skills are shipped in-tree** (Poland, Luxembourg, Switzerland, Sweden, Germany, Norway, plus the original Danish set) instead of living only in each user's own fork. Upstream's "no principled stopping point" objection is correct in general — but this repo isn't trying to be the one template everyone forks from, so shipping more reference implementations than any one user needs isn't a maintenance liability the way it would be upstream.
- **Personal data ships in the same repo as the generic template**, not just in each fork. The `personal/` folder (gitignored) plus `tools/resolve-doc.ts` (reads `personal/` first, falls back to the generic tracked file) is how that's made safe: the tracked files stay identical to upstream's placeholder template, so the privacy guarantee upstream gets by *keeping personal data out entirely* is preserved here too, just via a resolution layer instead of an absence.

None of this is upstream doing it wrong. It's a different problem: upstream optimizes for being the best possible thing to fork *from*; this repo optimizes for being a complete, working example of what a forked-and-fully-adapted instance looks like, with the specific adaptations (dual-harness, extra markets, the privacy split) built and tested rather than left as an exercise for the next person.

## Which one should you fork?

- **Fork upstream** if you want the smallest possible starting point, use Claude Code only, and plan to build your own market's portal skills and your own profile-data approach from scratch. Its `CONTRIBUTING.md` describes a real, active review process for exactly that use case — read it there, not here.
- **Fork this repo** if you also want Mistral Vibe support, want a head start on one of the markets already covered here, or want the `personal/`-split pattern already built rather than designing your own. You'll be forking a populated instance, so budget time to replace the profile data and prune what you don't need.

## Contributing to this fork specifically

This isn't run as an open template soliciting PRs the way upstream is — it's maintained for one person's active job search, and most of its recent history is periodic, deliberate ports of vetted upstream fixes (security/privacy hardening, portal bug fixes) rather than a queue of external contributions. That said:

- **Bug reports are welcome** — open an issue if something's actually broken (a portal skill returning garbage, a LaTeX template failing to compile, a genuine correctness bug). No promise on response time.
- **PRs for real bugs** (not style, not new market-specific skills, not architecture changes) are considered, judged by the same evidence bar upstream uses: state the failing case, show it reproduces, and keep the change to one concern.
- **New market-specific portal skills** are more likely to be useful as your own fork than a PR here — see upstream's own reasoning on this, which applies equally: there's no principled stopping point once one country's portal is in-tree.
- **Questions** are fine as GitHub issues on this repo. Broader design discussion about the universal-template shape of the project belongs in [upstream's Discussions](https://github.com/MadsLorentzen/ai-job-search/discussions), since that's the repo actually optimizing for that conversation.

## Credit

All credit for the original architecture, the drafter-reviewer application pipeline, the core command lifecycle (`/setup` → `/scrape` → `/rank` → `/apply` → `/interview` → `/outcome`), and the Danish portal skills that seeded the pattern goes to [Mads Lorentzen](https://github.com/MadsLorentzen) and upstream's contributors. See [README.md](README.md#whats-different-from-upstream) for the concrete list of what this fork adds on top of that foundation.
