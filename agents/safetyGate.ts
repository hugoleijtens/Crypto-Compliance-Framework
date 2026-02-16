import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import { parseFrameworkMdx } from '../lib/contentUtils';
import { FrameworkFrontmatterSchema } from '../lib/schema';
import { AgentLogger } from './logger';

const VENDOR_NAMES = [
  'chainalysis',
  'elliptic',
  'trm',
  'ciphertrace',
  'scorechain',
  'merklescience',
  'merkle science',
  'coinfirm',
  'crystal blockchain',
  'notabene',
  'sygna'
];

const MARKETING_PHRASES = ['best-in-class', 'industry-leading', 'seamless', 'revolutionary', 'world-class'];

const LEGAL_ADVICE_DISCLAIMER_PATTERNS: RegExp[] = [
  /\b(not|no)\s+legal advice\b/i,
  /\bdoes not (constitute|provide|offer)\s+legal advice\b/i,
  /\bnot intended as legal advice\b/i
];

const LEGAL_ADVICE_BLOCK_PATTERNS: RegExp[] = [
  /\bthis (is|constitutes|provides|offers)\s+legal advice\b/i,
  /\bseek\s+legal advice\b/i,
  /\bconsult\s+(an?|your)\s+(lawyer|attorney|solicitor)\b/i,
  /\b(attorney|lawyer|solicitor)\b/i
];

const COMPLIANCE_DISCLAIMER_PATTERNS: RegExp[] = [
  /\bdoes not (claim|assert)\b[\s\S]{0,80}\b(compliance|compliant)\b/i,
  /\bno claim\b[\s\S]{0,40}\b(compliance|compliant)\b/i,
  /\bnot intended\b[\s\S]{0,60}\b(compliance|compliant)\b/i
];

const COMPLIANCE_CLAIM_PATTERNS: RegExp[] = [
  /\b(guarantee|guarantees|ensure|ensures|certif(?:y|ies|ied)|prove|proves|demonstrate|demonstrates)\b[\s\S]{0,40}\b(compliance|compliant)\b/i,
  /\b(fully|completely)\s+compliant\b/i,
  /\bcertified\s+compliant\b/i,
  /\bcompliant with\b/i
];

const THRESHOLD_NUMERIC_PATTERNS: RegExp[] = [
  /(?:>=|<=|==|!=|>|<|=)\s*\d/,
  /\b\d+(?:\.\d+)?\s*(%|percent)\b/i,
  /\b\d[\d,.\s]{0,12}\s*(eur|gbp|usd|€|£|\$)\b/i
];

const THRESHOLD_WORD_PATTERN = /\bthresholds?\b/i;
const THRESHOLD_DISCLAIMER_PATTERNS: RegExp[] = [
  /\b(no|without)\s+thresholds?\b/i,
  /\bdoes not prescribe\b[\s\S]{0,60}\bthresholds?\b/i
];

const SCORING_PATTERNS: RegExp[] = [/\brisk\s*score\b/i, /\bscorecard\b/i, /\bscoring\b/i, /\bpoints?-based\b/i];
const SCORING_DISCLAIMER_PATTERNS: RegExp[] = [
  /\b(no|without)\s+scoring\b/i,
  /\bdoes not prescribe\b[\s\S]{0,60}\bscoring\b/i
];

const IDENTIFIER_PATTERNS: RegExp[] = [
  /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
  /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/i // IBAN-like
];

function extractBodyExcludingSources(raw: string): string {
  const marker = /^##\s+Sources\s*$/m;
  const m = marker.exec(raw);
  if (!m || typeof m.index !== 'number') return raw;
  return raw.slice(0, m.index).trim();
}

function stableFrontmatter(data: any): any {
  const fm = FrameworkFrontmatterSchema.parse(data);
  return {
    type: fm.type,
    status: fm.status,
    confidence: fm.confidence,
    scope: fm.scope,
    risk: fm.risk,
    lastReviewed: fm.lastReviewed
  };
}

function promoteStatusInFrontmatter(source: string, nextStatus: 'draft' | 'review' | 'published'): string {
  const m = source.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  if (!m) throw new Error('Frontmatter block not found at file start.');

  const frontmatter = m[1];
  const lines = frontmatter.split('\n');
  let found = false;

  const updated = lines.map((line) => {
    if (!line.trimStart().startsWith('status:')) return line;
    found = true;
    return `status: ${nextStatus}`;
  });

  if (!found) throw new Error('Frontmatter key \"status\" not found.');

  const head = `---\n${updated.join('\n')}\n---\n`;
  const rest = source.slice(m[0].length);
  return head + rest;
}

export async function runSafetyGate(opts: {
  rootDirAbs: string;
  logger: AgentLogger;
  candidateFiles: string[];
}): Promise<{
  approved: string[];
  rejected: Array<{ file: string; reasons: string[] }>;
  errors: number;
}> {
  const approved: string[] = [];
  const rejected: Array<{ file: string; reasons: string[] }> = [];
  let errors = 0;

  const auditFileAbs = path.join(opts.rootDirAbs, 'audit', `safetyGate-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);

  for (const fileAbs of opts.candidateFiles) {
    try {
      const source = await fs.readFile(fileAbs, 'utf8');
      const parsedMatter = matter(source);
      const fm = stableFrontmatter(parsedMatter.data);

      if (fm.status !== 'draft') {
        continue;
      }

      // Schema + required sections.
      const parsed = parseFrameworkMdx(source);

      const bodyToScan = extractBodyExcludingSources(parsed.rawBody);
      const lower = bodyToScan.toLowerCase();

      const reasons: string[] = [];

      for (const v of VENDOR_NAMES) {
        if (lower.includes(v)) reasons.push(`vendor-name:${v}`);
      }

      for (const p of MARKETING_PHRASES) {
        if (lower.includes(p)) reasons.push(`marketing-phrase:${p}`);
      }

      const hasLegalAdviceMention = /\blegal advice\b/i.test(bodyToScan);
      const isLegalAdviceDisclaimer = LEGAL_ADVICE_DISCLAIMER_PATTERNS.some((re) => re.test(bodyToScan));
      if (hasLegalAdviceMention && !isLegalAdviceDisclaimer) reasons.push('legal-advice:ambiguous-mention');
      for (const re of LEGAL_ADVICE_BLOCK_PATTERNS) {
        if (re.test(bodyToScan)) reasons.push(`legal-advice-pattern:${String(re)}`);
      }

      const complianceClaimHit = COMPLIANCE_CLAIM_PATTERNS.find((re) => re.test(bodyToScan));
      if (complianceClaimHit) {
        const isComplianceDisclaimer = COMPLIANCE_DISCLAIMER_PATTERNS.some((re) => re.test(bodyToScan));
        if (!isComplianceDisclaimer) reasons.push(`compliance-claim:${String(complianceClaimHit)}`);
      }

      const thresholdNumericHit = THRESHOLD_NUMERIC_PATTERNS.find((re) => re.test(bodyToScan));
      if (thresholdNumericHit) reasons.push(`threshold-numeric:${String(thresholdNumericHit)}`);
      if (THRESHOLD_WORD_PATTERN.test(bodyToScan)) {
        const isThresholdDisclaimer = THRESHOLD_DISCLAIMER_PATTERNS.some((re) => re.test(bodyToScan));
        if (!isThresholdDisclaimer) reasons.push('threshold:word');
      }

      const scoringHit = SCORING_PATTERNS.find((re) => re.test(bodyToScan));
      if (scoringHit) {
        const isScoringDisclaimer = SCORING_DISCLAIMER_PATTERNS.some((re) => re.test(bodyToScan));
        if (!isScoringDisclaimer) reasons.push(`scoring:${String(scoringHit)}`);
      }

      for (const re of IDENTIFIER_PATTERNS) {
        if (re.test(bodyToScan)) reasons.push(`identifier-pattern:${String(re)}`);
      }

      if (reasons.length > 0) {
        rejected.push({ file: fileAbs, reasons });
        await opts.logger.log({
          agent: 'safetyGate',
          action: 'reject',
          message: fileAbs,
          meta: { reasons }
        });
        continue;
      }

      // Promote to review.
      const out = promoteStatusInFrontmatter(source, 'review');
      await fs.writeFile(fileAbs, out, 'utf8');

      approved.push(fileAbs);
      await opts.logger.log({
        agent: 'safetyGate',
        action: 'approve',
        message: fileAbs
      });
    } catch (err) {
      errors += 1;
      await opts.logger.log({
        agent: 'safetyGate',
        action: 'error',
        message: String(err),
        meta: { file: fileAbs }
      });
    }
  }

  await fs.mkdir(path.dirname(auditFileAbs), { recursive: true });
  await fs.writeFile(
    auditFileAbs,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        approved,
        rejected,
        errors
      },
      null,
      2
    ) + '\n',
    'utf8'
  );

  await opts.logger.log({
    agent: 'safetyGate',
    action: 'run.summary',
    message: `approved=${approved.length} rejected=${rejected.length} errors=${errors}`
  });

  return { approved, rejected, errors };
}
