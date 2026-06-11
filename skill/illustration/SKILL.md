---
name: illustration
description: Read a complete article or draft, decide where illustrations would clarify the text, and insert ASCII sketch illustrations directly into the corresponding body positions. Use when the user asks to add illustrations, diagrams, visual sketches, or "配图" to an article while explicitly needing ASCII-only output and no generated bitmap images.
---

# Illustration

## Workflow

1. Read the entire article before making any edits. Do not start inserting sketches from the first paragraph alone.
2. Identify only the locations where a sketch clarifies structure, contrast, sequence, causality, hierarchy, or the relationship between entities.
3. For each selected location, define the single most important relationship in the current paragraph or nearby passage.
4. Insert one ASCII sketch immediately after the paragraph it supports, unless the article's format clearly requires the sketch before the paragraph.
5. Preserve the original article wording except for inserting the sketches and any minimal spacing needed around them.

## Placement Rules

- Add a sketch only when it helps the reader understand the paragraph faster than text alone.
- Prefer fewer, sharper sketches over decorating every section.
- Avoid adding sketches to purely transitional, poetic, or summary paragraphs unless they introduce an important relationship.
- If several adjacent paragraphs express the same relationship, add one sketch after the paragraph where the relationship becomes clearest.
- Keep each sketch local to its paragraph. Do not use one sketch to summarize the whole article unless the paragraph itself is a whole-article overview.

## ASCII Sketch Rules

- Use plain ASCII characters only. Avoid Unicode box drawing, emoji, or generated images.
- Keep sketches compact enough to sit inside body text without dominating it.
- Label only the essential entities. Prefer 2-5 labels per sketch.
- Show relationships with simple arrows, grouping, containment, timelines, funnels, or comparison layouts.
- Use neutral placeholders when the article's terms are long, then include a short legend only if needed.
- Do not create polished art. Produce a rough editorial sketch that communicates structure.

## Useful Patterns

Use these forms as starting points and adapt them to the paragraph:

```text
Cause -> Action -> Result
```

```text
Before        After
------        -----
  A     ->      B
```

```text
        Main idea
       /    |    \
   Part 1 Part 2 Part 3
```

```text
Input -> [Process] -> Output
           |
        Constraint
```

```text
Option A <---- tension ----> Option B
```

## Output

Return the full revised article with the ASCII sketches inserted in place. If the user asks for changes in a file, edit that file directly and keep the original format as much as possible.
