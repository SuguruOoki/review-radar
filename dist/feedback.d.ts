import { type Feedback, type Report } from './types.js';
export declare function loadReport(path: string): Report;
export declare function recordFeedback(report: Report, path: string, unitId: string, outcome: string, minutes: number, note?: string): Feedback;
export declare function evaluate(report: Report, path: string, topK: number): Record<string, unknown>;
