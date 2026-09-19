export const AXES = ['impact', 'verificationGap', 'humanJudgment', 'boundary', 'novelty'] as const;
export type Axis = typeof AXES[number];
export type Route = 'human_required' | 'human_review' | 'context_needed' | 'regular_review';
export type ProviderStatus = 'heuristic' | 'live' | 'cached' | 'error' | 'budget_skipped' | 'not_applicable';
export type Focus = 'authorization' | 'money' | 'data' | 'async' | 'contract' | 'general';
export interface AxisValue { value: number | null; source: 'heuristic' | 'jev'; note: string }
export interface Evidence {
  id: string; kind: 'diff' | 'before' | 'after' | 'test' | 'dependency' | 'spec';
  path: string; side: 'base' | 'head' | 'provided'; start: number; end: number;
  text: string; truncated: boolean;
}
export interface Signal {
  id: string; title: string; mandatory: boolean; focus: Focus; evidenceId: string;
  note: string;
}
export interface Hunk {
  header: string; oldStart: number; oldCount: number; newStart: number; newCount: number;
  text: string; added: string[]; removed: string[]; addedLines: number[]; removedLines: number[];
}
export interface Candidate {
  id: string; path: string; status: string; oldMode: string; newMode: string;
  oldStart: number; oldEnd: number; newStart: number; newEnd: number;
  added: number; removed: number; diff: string; signals: Signal[];
  evidence: Evidence[]; axes: Record<Axis, AxisValue>; focus: Focus;
  missing: string[]; providerStatus: ProviderStatus; providerError?: string;
  rawAnswers?: Record<string, unknown>; selectedEvidenceId?: string;
  uncertainty: number | null; score: number | null; knownWeight: number;
  route: Route; required: boolean; questions: string[];
  historyCommits: number | null; requestedModel?: string; returnedModel?: string;
}
export interface PathRule { id: string; pattern: string; title: string; focus: Focus; mandatory: boolean }
export interface Config {
  weights: Record<Axis, number>;
  thresholds: { human: number; uncertainty: number; confidence: number };
  limits: { maxFiles: number; maxUnits: number; maxFileBytes: number; maxPatchBytes: number; evidenceChars: number; relatedFiles: number };
  jev: { model: string; maxRequests: number; concurrency: number; timeoutMs: number; retries: number; cacheTtlHours: number };
  exclude: string[]; pathRules: PathRule[];
}
export interface Omission { path: string; reason: string; manualReview: boolean }
export interface ScanOptions {
  repo: string; base?: string; head?: string; staged?: boolean; mergeBase?: boolean;
  includeUntracked?: boolean; provider: 'heuristic' | 'jev'; allowExternalData?: boolean;
  context?: string; ci?: string; out: string; config: Config; dryRun?: boolean; noCache?: boolean;
  progress?: (message: string) => void;
}
export interface Snapshot {
  root: string; baseSha: string; headSha: string | null; headLabel: string;
  mode: 'commits' | 'worktree' | 'staged'; files: ChangedFile[];
  inventory: Map<string, string>; untracked: string[]; diffFingerprint: string;
}
export interface ChangedFile { path: string; status: string; oldMode: string; newMode: string; untracked?: boolean }
export interface Usage {
  requests: number; cacheHits: number; errors: number; budgetSkipped: number;
  inputTokens: number; outputTokens: number; redactions: number;
}
export interface Report {
  schemaVersion: 1; toolVersion: '0.1.0'; id: string; createdAt: string; demo: boolean;
  repository: { name: string; base: string; head: string; mode: string; diffFingerprint: string };
  provider: 'heuristic' | 'jev'; config: Config; candidates: Candidate[];
  omissions: Omission[]; warnings: string[]; auditSample: string[];
  usage: Usage; complete: boolean;
  ci: { status: 'passed' | 'failed' | 'unknown'; note: string };
}
export interface ScoreQuestion { type: 'score'; instructions: string; criteria: string[] }
export interface ChoiceQuestion { type: 'choice'; instructions: string; criteria: Record<string, string> }
export type Question = ScoreQuestion | ChoiceQuestion;
export interface ScoreAnswer { type: 'score'; score: number; confidence: number; probabilities: Record<string, number>; legend?: Record<string, unknown> }
export interface ChoiceAnswer { type: 'choice'; choice: string; confidence: number; probabilities: Record<string, number> }
export type Answer = ScoreAnswer | ChoiceAnswer;
export interface JevResponse { model: string; answers: Record<string, Answer>; usage: { input_tokens: number; output_tokens: number } }
export const OUTCOMES = ['critical_fix', 'bug_fix', 'spec_decision', 'design_decision', 'cosmetic', 'no_action', 'insufficient_context'] as const;
export type Outcome = typeof OUTCOMES[number];
export interface Feedback { version: 1; reportId: string; unitId: string; timestamp: string; outcome: Outcome; minutes: number; note: string; score: number | null; route: Route }
