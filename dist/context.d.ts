import type { Candidate, Omission, ScanOptions, Snapshot } from './types.js';
export declare function isTest(path: string): boolean;
export interface BuildResult {
    candidates: Candidate[];
    omissions: Omission[];
    warnings: string[];
}
export declare function buildCandidates(s: Snapshot, options: ScanOptions): BuildResult;
export declare const languageExtension: (path: string) => string;
