---
name: write-root-folder-doc
description: Creates a high-level CLAUDE.md for the root (top-level) folder — system overview, domain decomposition, and navigation across folders. Use when user asks to document the whole project or entry folder.
argument-hint: <root-folder-path>
---

## Core Principle

Focus on **system-level structure and relationships between folders**, not files or implementation.

Strictly avoid:

- any function-level or class-level explanations
- internal logic of files
- step-by-step flows inside modules
- low-level details

This document must remain valid even if internal implementations change.

---

## Output Structure

### 1. System Role

- 2–4 sentences
- What the system does as a whole
- What problem it solves
- At what level (UI / domain / service / tool / engine)

---

### 2. System Responsibilities

- 4–7 bullet points
- Describe system-level responsibilities
- Focus on capabilities, not implementation

---

### 3. Folder Map (Core of the document)

List **top-level folders only**.

For each folder:

- 1-line purpose
- its role in the system

Format:

```

src/domain → core business logic
src/ui → rendering and interaction
src/data → persistence and external data

```

---

### 4. Architecture Overview

Describe how folders interact.

Format example:

```

UI → Domain → Data
↓
Services

```

Or short bullet relationships:

- UI triggers Domain
- Domain uses Data
- Services orchestrate cross-domain logic

No implementation details.

---

### 5. High-Level Data Flow

Only major transformations across layers:

```

user input
↓
UI layer
↓
domain logic
↓
data/storage
↓
response/output

```

Keep it abstract.

---

### 6. Key Entry Points

- main starting points of the system

Examples:

- app bootstrap
- main scene / main module
- API entrypoint

Format:

```

entry → file/folder

```

---

### 7. Dependencies Between Folders

Only important directional relationships:

```

domain → does not depend on UI
ui → depends on domain
data → used by domain

```

Focus on architectural constraints.

---

### 8. System Invariants

- 4–6 bullet points
- Rules that must hold across the whole system

Examples:

- domain logic must be UI-independent
- data layer must not contain business decisions
- UI must not mutate core state directly

---

### 9. Where to Modify

Global navigation map:

```

feature / change → folder

```

Examples:

```

change business rule → src/domain
change UI behavior → src/ui
change data source → src/data

```

Must be practical and guide navigation across folders.

---

## Style Rules

- keep it short
- prioritize clarity over completeness
- no file-level details (except entry points)
- no duplication
- no deep nesting
- use real folder names

---

## Quality Criteria

The result is valid if it answers:

- what system is this?
- how is it split into parts?
- how do parts interact?
- where do I go to change something?

And:

- contains **zero implementation details**
- works as a navigation map for the whole project

---

## Output Template

Write the result as a new file `CLAUDE.md` in the root folder:

```

# <project_name>

## System Role

...

## Responsibilities

* ...
* ...

## Folder Map

* src/domain → ...
* src/ui → ...
* src/data → ...

## Architecture Overview

...

## Data Flow

input
↓
...
↓
output

## Entry Points

* ... → ...

## Dependencies

* ...
* ...

## Invariants

* ...
* ...

## Where to Modify

* change X → folder
* change Y → folder
```
