import type { Candidate, Omission, ScanOptions, Snapshot } from './types.js';
import { isTest } from './util.js';
export { isTest };
export interface BuildResult {
    candidates: Candidate[];
    omissions: Omission[];
    warnings: string[];
}
export declare function buildCandidates(s: Snapshot, options: ScanOptions): BuildResult;
export declare const languageExtension: (path: string) => string;
