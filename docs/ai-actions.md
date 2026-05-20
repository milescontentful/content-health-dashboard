# AI Actions Setup Guide

The Content Health Dashboard uses two **Contentful AI Actions** for its AI-powered features. These actions need to be created in each Contentful space where the app is installed. Copy the prompts below directly into your AI Action configuration.

---

## How to create an AI Action

1. Open your space in Contentful
2. Navigate to **Settings → AI Actions** (or go to `https://app.contentful.com/spaces/<YOUR_SPACE_ID>/ai/actions`)
3. Click **Create AI Action**
4. Fill in the name, add the variable, paste the prompt template
5. Set **Output type** to **Suggestion** and **Scope** to **Entry**
6. Save and publish
7. Copy the AI Action ID and paste it into **Config Screen → App Functions**

---

## 1. Content Quality Audit

**Purpose:** Grades entry content quality, completeness, readability, and SEO-readiness. Used by the AI Audit tab.

| Setting | Value |
|---|---|
| Name | `Content Quality Audit` |
| Output type | Suggestion |
| Scope | Entry |
| Model | Claude Sonnet (or equivalent) |
| Temperature | 0.2 |

### Variable

| Field | Value |
|---|---|
| Variable ID | `entryContent` |
| Variable name | `Entry Content` |
| Type | `StandardInput` |
| Description | The full entry content to audit, formatted as field name: value pairs |

### Prompt template

```
You are a senior content strategist and editor.

Audit the entry below and respond in this exact plain-text format (no JSON, no markdown fences):

QUALITY SCORE
[0-100] — [one-word band: Excellent / Good / Needs work / Poor]

SUMMARY
[2-3 sentences: key strengths and weaknesses]

COMPLETENESS
Missing required fields: [comma-separated list, or "None"]
Missing optional fields: [comma-separated list, or "None"]

READABILITY
Score: [0-100]
[One sentence of feedback]

SEO READINESS
Score: [0-100]
[One sentence of feedback]

TOP SUGGESTIONS
1. [Most impactful improvement]
2. [Second improvement]
3. [Third improvement]
4. [Fourth improvement]
5. [Fifth improvement]

Scoring guide:
75-100: Clear, complete, well-structured, good length, strong messaging
50-74: Usable but missing key elements (descriptions, CTAs, length)
0-49: Thin, unclear, or largely incomplete

Entry to audit:
{{var.entryContent}}
```

### Config Screen field

After creating the action, copy its ID and paste it into:
**Config Screen → App Functions → Content Audit — App Action ID**

---

## 2. SEO / GEO Audit

**Purpose:** Audits page content for SEO, AEO (Answer Engine Optimization), and GEO (Generative Engine Optimization) readiness. Returns scores, recommendations, and AI-rewritten meta title and description suggestions. Used by the SEO / GEO tab.

| Setting | Value |
|---|---|
| Name | `SEO / GEO Audit` |
| Output type | Suggestion |
| Scope | Entry |
| Model | Claude Sonnet (or equivalent) |
| Temperature | 0.2 |

### Variable

| Field | Value |
|---|---|
| Variable ID | `pageContent` |
| Variable name | `Page Content` |
| Type | `StandardInput` |
| Description | The page content to audit, formatted as field name: value pairs |

### Prompt template

```
You are a senior content strategist specialising in SEO, AEO (Answer Engine Optimisation), and GEO (Generative Engine Optimisation — getting cited by AI systems like ChatGPT, Perplexity, and Claude).

Audit the page content below and respond in this exact plain-text format (no JSON, no markdown fences):

SCORES
SEO: [0-100] | AEO: [0-100] | GEO: [0-100] | Composite: [0-100]

SUMMARY
[2-3 sentences: overall strengths and weaknesses]

TOP RECOMMENDATIONS
1. [Most impactful fix]
2. [Second fix]
3. [Third fix]
4. [Fourth fix]
5. [Fifth fix]

META TITLE SUGGESTION
[Rewritten title 50-60 chars optimised for search and AI citations — or "Existing title is strong" if no change needed]

META DESCRIPTION SUGGESTION
[Rewritten description 140-155 chars optimised for featured snippets — or "Existing description is strong" if no change needed]

Scoring bands: 75-100 Strong · 50-74 Needs improvement · 0-49 Poor
SEO checks: title, meta description, slug, content ≥300 chars, ≥4 sentences
AEO checks: questions, opening ≥60 chars, bullet/numbered lists, definitions, FAQ content, ≥500 chars
GEO checks: brand/org field, structured data terminology, conversational tone, statistics, clear subject in first 100 chars, recent year reference, ≥800 chars

Page content:
{{var.pageContent}}
```

### Config Screen field

After creating the action, copy its ID and paste it into:
**Config Screen → SEO / GEO → SEO / GEO Audit — App Action ID**

---

## Your AI Action IDs (this space)

These were created in space `phci7gs546o3` and can be used as a reference:

| Action | ID |
|---|---|
| Content Quality Audit | `QxUvuseUCOu9qIjLkRx3f` |
| SEO / GEO Audit | `GrWpINbAeGeeit4IlCLa3` |

> Each Contentful space has its own AI Actions with unique IDs. The IDs above only work in space `phci7gs546o3`. Every colleague needs to create their own actions in their space and paste those IDs into the Config Screen.
