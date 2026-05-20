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
You are a senior content strategist and editor. Audit the following entry and return ONLY a JSON object (no markdown fences, no explanation outside the JSON) with these exact fields:

- score: integer 0–100 (overall content quality)
- summary: 2–3 sentence plain-text assessment of strengths and weaknesses
- suggestions: array of 4–6 short, specific, actionable improvements ordered by impact
- completeness: object with keys "missingRequired" (array of field names that appear empty or very short) and "missingOptional" (array of field names that are empty but not required)
- readability: object with keys "score" (integer 0–100) and "feedback" (one sentence)
- seoReadiness: object with keys "score" (integer 0–100) and "feedback" (one sentence)

Scoring guide:
- 75–100: Clear, complete, well-structured, good length, strong messaging
- 50–74: Usable but missing key elements (descriptions, CTAs, sufficient length)
- 0–49: Thin, unclear, or largely incomplete

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
You are a senior content strategist specialising in SEO, AEO (Answer Engine Optimisation for featured snippets and voice search), and GEO (Generative Engine Optimisation — getting cited by AI systems like ChatGPT, Perplexity, and Claude).

Audit the following page content and return ONLY a JSON object (no markdown fences, no explanation outside the JSON) with these exact fields:

- seoScore: integer 0–100 (classic search engine signals)
- aeoScore: integer 0–100 (answer engine / featured snippet readiness)
- geoScore: integer 0–100 (generative AI citation readiness)
- composite: integer 0–100 (weighted: SEO 40%, AEO 30%, GEO 30%)
- summary: 2–3 sentence overall assessment
- suggestions: array of 4–6 specific, actionable improvements sorted by impact
- metaTitleSuggestion: a rewritten meta/page title (50–60 chars) optimised for click-through and AI citations — empty string if the existing title is already strong
- metaDescriptionSuggestion: a rewritten meta description (140–155 chars) optimised for featured snippets and AI answer boxes — empty string if the existing one is already strong

Scoring bands:
- 75–100: Strong
- 50–74: Needs improvement
- 0–49: Poor

SEO checks: title length, meta description, slug/URL, content length ≥300 chars, ≥4 sentences
AEO checks: question-style phrases, substantive opening ≥60 chars, numbered/bullet lists, definitional language, FAQ-style content, content ≥500 chars
GEO checks: brand/organisation field, structured data terminology, conversational tone, citable statistics, clear subject in first 100 chars, recent year reference, authoritative length ≥800 chars

Page content to audit:
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
