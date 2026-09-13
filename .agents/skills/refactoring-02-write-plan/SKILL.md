---
name: write-plan
description: Writes plan based on previous analysis and users request.
---

You receive a user request for improvement. Based on the previous analysis of the game code and the user request, you must write an implementation/refactoring plan.

Write plan as a task for a new developer unfamiliar with the task, who did not participate in this dialogue.
In the plan:

1. Specify the problem we're solving, what we want to achieve, and why. Indicate that the documentation and tests are not final requirements and should be corrected during refactoring.
2. Write a complete step-by-step plan for solving the problem. If anything needs clarification in the code for writing the plan, clarify it yourself; don't leave it to the developer to decide. In the plan, write a specific implementation option; do not leave different implementation options in the plan.
3. Don't add manual checks in the plan.
4. Right checks:

- `npm test`
- `node scripts/check-boundaries.mjs`

DO NOT write or edit the code! Just write the plan!
General information about the game's design is in /workspace/CLAUDE.md and in separate folders in CLAUDE.md - information about the design of these folders.
Carefully check that plan meets the requirements of @CLAUDE.md file and does not violate the boundaries.

If the user hasn't specified a reply language, reply in English. The user's current language is NOT considered a reply language; only a direct request to reply in a specific language is considered. If the user has explicitly specified a language, reply in the language they requested.
