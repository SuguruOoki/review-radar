import { type Candidate, type Report } from './types.js';
export declare function location(c: Candidate): string;
export declare function markdown(report: Report): string;
export declare function reportHtml(report: Report): string;
export declare function writeReport(report: Report, out: string): void;
