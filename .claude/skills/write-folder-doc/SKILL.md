---
name: write-folder-doc
description: Creates a short structured orientation CLAUDE.md for a folder — its role, responsibilities, key files, invariants and navigation. Writes the whole file text into the plan. Use when user asks to write CLAUDE.md for a specific folder.
argument-hint: <folder-path>
---

## Core Principle

Focus on **structure and intent**, not implementation.

Strictly avoid:

- internal logic explanations
- step-by-step algorithms
- detailed function behavior
- code duplication

The output must remain valid even if implementation changes.

---

## Output Structure

### 1. Role of the Folder

- 1–3 sentences
- Answer: what part of the system this is (domain, UI, orchestration, data, etc.)

---

### 2. Responsibilities

- 3–6 bullet points
- Describe **what problems are solved**, not how

---

### 3. Key Files

For each important file:

- one-line purpose
- optionally 2–4 key functions or roles

Do NOT:

- list all functions
- explain internal logic

---

### 4. Structural Role

One line format:

```
folder → role in system
```

---

### 5. Data Flow

Describe transformations only:

```
input
↓
processing
↓
state change
↓
output
```

No code. No implementation details.

---

### 6. Key Dependencies

- what this folder depends on
- what depends on it

Only important relationships.

---

### 7. Critical Invariants

- 3–5 bullet points
- Only rules that must never break

Focus on things that can cause bugs.

---

### 8. Where to Modify Logic

Navigation map:

```
change/feature → file
```

This section must be practical and actionable.

---

## Style Rules

- keep it short
- use bullet points
- avoid long paragraphs
- no duplication
- no comparisons between folders
- use original code names (no renaming)

---

## Quality Criteria

The result is valid if it clearly answers:

- where am I?
- what does this folder do?
- where do I change specific behavior?
- what must not break?

And:

- contains **zero implementation details**
- remains valid if internal logic changes

---

## Output Template

Write the result as a new file `CLAUDE.md` inside the target folder using this template:

```
# <folder_name>

## Role
...

## Responsibilities
- ...
- ...

## Key Files
- file.ts — ...
- file2.ts — ...

## Structural Role
<folder> → ...

## Data Flow
input
↓
...
↓
output

## Dependencies
- depends on: ...
- used by: ...

## Invariants
- ...
- ...

## Where to Modify
- change X → file.ts
- change Y → file2.ts
```
