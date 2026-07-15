/**
 * Pure scoring logic — no React, no SDK.
 * Each scorer inspects an entry's fields (as plain objects) and returns
 * a score 0–100 plus a list of issues.
 */

import { extractRichText } from '../../lib/richText';

export interface ScoreResult {
  score: number;
  issues: string[];
  passes: string[];
}

type Fields = Record<string, Record<string, unknown>>;

function flatValues(fields: Fields, locale: string): string[] {
  return Object.values(fields)
    .map((f) => {
      const v = f?.[locale];
      if (typeof v === 'string') return v;
      if (typeof v === 'object' && v !== null && 'content' in v) {
        // Rich text — extract all text node values
        return extractRichText(v as any);
      }
      return '';
    })
    .filter(Boolean);
}

function getFieldValue(fields: Fields, locale: string, fieldId: string): string {
  const v = fields[fieldId]?.[locale];
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && v !== null && 'content' in v) return extractRichText(v);
  return '';
}

function hasField(fields: Fields, locale: string, fieldId: string): boolean {
  const v = fields[fieldId]?.[locale];
  return v !== undefined && v !== null && v !== '';
}

// ── SEO scorer ────────────────────────────────────────────────────────────────

export function scoreSEO(fields: Fields, locale: string, fieldNames: Record<string, string>): ScoreResult {
  const issues: string[] = [];
  const passes: string[] = [];
  let points = 0;
  const maxPoints = 7;

  // 1. Title / name field exists
  const titleField = fieldNames.title ?? Object.keys(fields)[0];
  const title = getFieldValue(fields, locale, titleField);
  if (title) { passes.push('Entry has a title'); points++; }
  else issues.push('Missing title field');

  // 2. Title length 40–65 chars
  if (title && title.length >= 40 && title.length <= 65) {
    passes.push(`Title length ${title.length} chars (ideal 40–65)`); points++;
  } else if (title) {
    issues.push(`Title length ${title.length} chars — ideal range is 40–65`);
  }

  // 3. SEO description / meta description
  const descField = fieldNames.seoDescription ?? fieldNames.metaDescription ?? fieldNames.description ?? '';
  const desc = descField ? getFieldValue(fields, locale, descField) : '';
  if (desc) { passes.push('Meta description present'); points++; }
  else issues.push('No meta description field found');

  // 4. Description length 120–160 chars
  if (desc && desc.length >= 120 && desc.length <= 160) {
    passes.push(`Description length ${desc.length} chars (ideal 120–160)`); points++;
  } else if (desc) {
    issues.push(`Description length ${desc.length} chars — ideal range is 120–160`);
  }

  // 5. Has slug / URL path
  const slugField = fieldNames.slug ?? fieldNames.urlPath ?? fieldNames.path ?? '';
  if (slugField && hasField(fields, locale, slugField)) {
    passes.push('Slug/URL path present'); points++;
  } else {
    issues.push('No slug or URL path detected');
  }

  // 6. Alt text on images (check asset links in fields)
  const bodyField = fieldNames.body ?? fieldNames.content ?? fieldNames.richText ?? '';
  const bodyText = bodyField ? getFieldValue(fields, locale, bodyField) : flatValues(fields, locale).join(' ');
  if (bodyText.length > 300) {
    passes.push('Content has sufficient length'); points++;
  } else {
    issues.push('Content appears short (< 300 chars of text detected)');
  }

  // 7. No duplicate content (heuristic: at least one unique sentence)
  if (bodyText.split('.').length > 3) {
    passes.push('Content has multiple sentences'); points++;
  } else {
    issues.push('Content may be too thin — fewer than 4 sentences detected');
  }

  return { score: Math.round((points / maxPoints) * 100), issues, passes };
}

// ── AEO scorer ────────────────────────────────────────────────────────────────

export function scoreAEO(fields: Fields, locale: string, fieldNames: Record<string, string>): ScoreResult {
  const issues: string[] = [];
  const passes: string[] = [];
  let points = 0;
  const maxPoints = 6;

  const allText = flatValues(fields, locale).join(' ');

  // 1. Question-style heading (who, what, when, where, why, how)
  const questionPattern = /\b(who|what|when|where|why|how)\b/i;
  if (questionPattern.test(allText)) {
    passes.push('Contains question-style phrases (who/what/when/where/why/how)'); points++;
  } else {
    issues.push('No question-style headings detected — AEO favours Q&A structure');
  }

  // 2. Direct answer in first ~150 chars
  const firstChunk = allText.slice(0, 150);
  if (firstChunk.length > 60) {
    passes.push('Content starts with a substantive statement'); points++;
  } else {
    issues.push('Opening content is very short — lead with a direct answer or definition');
  }

  // 3. Numbered or bulleted lists (plain text heuristic: numbers at line start)
  if (/^\s*(\d+[.)]\s|-|\*)/m.test(allText)) {
    passes.push('Contains list-style content — good for featured snippets'); points++;
  } else {
    issues.push('No list-style content detected — consider adding bullet points or numbered steps');
  }

  // 4. Definitional statements ("X is a …", "X refers to …")
  if (/\b(is a|is an|refers to|defined as|means that)\b/i.test(allText)) {
    passes.push('Contains definitional language — great for answer boxes'); points++;
  } else {
    issues.push('No definitional statements found — try including an explicit definition');
  }

  // 5. Has FAQ field or FAQ-style content
  const faqField = fieldNames.faq ?? fieldNames.faqs ?? '';
  if ((faqField && hasField(fields, locale, faqField)) || /\bfaq\b/i.test(allText)) {
    passes.push('FAQ content detected'); points++;
  } else {
    issues.push('No FAQ section found — structured Q&A content improves answer engine visibility');
  }

  // 6. Content freshness: check updatedAt indirectly (we don't have it here, award point if body > 500 chars)
  if (allText.length > 500) {
    passes.push('Content is substantive (> 500 chars)'); points++;
  } else {
    issues.push('Content may be too brief for authoritative answer engine treatment');
  }

  return { score: Math.round((points / maxPoints) * 100), issues, passes };
}

// ── GEO scorer ────────────────────────────────────────────────────────────────

export function scoreGEO(fields: Fields, locale: string, fieldNames: Record<string, string>): ScoreResult {
  const issues: string[] = [];
  const passes: string[] = [];
  let points = 0;
  const maxPoints = 7;

  const allText = flatValues(fields, locale).join(' ');

  // 1. Brand/entity mention
  const brandField = fieldNames.brand ?? fieldNames.organization ?? '';
  if (brandField && hasField(fields, locale, brandField)) {
    passes.push('Brand/entity field present — LLMs can ground responses'); points++;
  } else {
    issues.push('No brand or organization field found — LLMs struggle with ungrounded content');
  }

  // 2. Structured data signals (schema-like keywords)
  if (/\b(schema|structured data|json-?ld|microdata|open graph|og:|@type)\b/i.test(allText)) {
    passes.push('Structured data terminology detected'); points++;
  } else {
    issues.push('No structured data signals — GEO benefits from schema.org markup context');
  }

  // 3. Conversational tone (second-person, contractions)
  if (/\b(you|your|you're|you'll|you've)\b/i.test(allText)) {
    passes.push('Conversational tone (uses "you") — natural for AI-generated summaries'); points++;
  } else {
    issues.push('No second-person language — AI tends to cite conversational content more naturally');
  }

  // 4. Citation-friendly statistics (numbers + % or specific claims)
  if (/\d+(\.\d+)?(%|\s*(percent|million|billion|thousand|x faster|x more))/i.test(allText)) {
    passes.push('Contains citable statistics — LLMs reference specific data points'); points++;
  } else {
    issues.push('No specific statistics detected — add data points that AI can cite confidently');
  }

  // 5. Entity clarity (clear subject in first 100 chars)
  const opening = allText.slice(0, 100);
  if (opening.split(' ').length > 8) {
    passes.push('Opening establishes subject clearly'); points++;
  } else {
    issues.push('Opening is too short to establish entity context for LLMs');
  }

  // 6. Content recency signals
  const yearPattern = /\b(202[4-9]|2030)\b/;
  if (yearPattern.test(allText)) {
    passes.push('Content references recent year — freshness signal for AI systems'); points++;
  } else {
    issues.push('No recent year reference found — AI systems favour fresh, dated content');
  }

  // 7. Authoritative length
  if (allText.length > 800) {
    passes.push('Content is authoritative length (> 800 chars)'); points++;
  } else {
    issues.push('Content is short — generative AI tends to surface longer, more comprehensive sources');
  }

  return { score: Math.round((points / maxPoints) * 100), issues, passes };
}
