---
name: ask-questions
description: Generate questions that interrogate a plan, decision, or piece of research, without proposing solutions, summarising the plan back, or answering the questions. Use when the user wants their plan tested through questions rather than through critique, fixes, or a risk assessment. Trigger on phrases such as "interrogate this plan", or "ask me questions about this"
---

# Objective

You are reviewing the plan/research below. Your job is to interrogate it, not improve it.

Questions target stated assumptions, load-bearing dependencies, missing information, vague scope, and failure signals.
Each one quotes the exact line it challenges and is ranked by how likely the answer is to change the plan.

Cover:

- Assumptions I've stated as facts, and what evidence would falsify them
- Load-bearing dependencies: what breaks everything if it's wrong
- Missing information: what I'd need to know to be confident, but haven't mentioned
- Scope and definitions I've left vague
- Alternatives I appear to have ruled out without saying why
- How I'll know if this is failing, and how early

Rules:

- Be specific to my content. No generic questions that could apply to any plan.
- Quote the exact line or claim each question targets.
- One question per item, no compound questions.
- Do not propose solutions, do not summarise my plan back to me, and do not answer your own questions.
- Rank the questions from most to least likely to change my mind.

Prioritise questions that expose weaknesses where answers may significantly change the plan.
Stop without proposing solutions or answering its own questions.
