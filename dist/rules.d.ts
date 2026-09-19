import { type Axis, type Candidate, type Config, type Focus, type Hunk, type Signal } from './types.js';
export declare const AXIS_LABELS: Record<Axis, string>;
export declare const ROUTE_LABELS: {
    human_required: string;
    human_review: string;
    context_needed: string;
    regular_review: string;
};
export declare const FOCUS_QUESTIONS: Record<Focus, string[]>;
export declare function detectSignals(path: string, hunk: Hunk | null, config: Config): Signal[];
export declare function chooseFocus(signals: Signal[]): Focus;
export declare function initialAxes(c: Pick<Candidate, 'signals' | 'status' | 'historyCommits'>): Record<Axis, {
    value: number | null;
    source: 'heuristic';
    note: string;
}>;
/** Scores are priorities, never defect probabilities. Unknown dimensions stay null. */
export declare function rankCandidate(c: Candidate, config: Config): Candidate;
export declare function sortCandidates(cs: Candidate[]): Candidate[];
