import { type Candidate, type Config, type JevResponse, type Question, type Usage } from './types.js';
export declare function resolveEndpoint(override: string | undefined): string;
export declare const ENDPOINT: string;
export declare const LOCAL_ENDPOINT: boolean;
export declare const RUBRIC_VERSION = "2026-09-19.v1";
export declare function questions(c: Candidate): Record<string, Question>;
export declare function buildRequest(c: Candidate, config: Config, ci: {
    status: string;
    note: string;
}): {
    body: Record<string, unknown>;
    redactions: number;
};
export declare function validateResponse(raw: unknown, qs: Record<string, Question>): JevResponse;
export declare class BudgetExhausted extends Error {
    constructor();
}
export interface ClientOptions {
    config: Config;
    apiKey: string;
    cacheDir?: string;
    fetcher?: typeof fetch;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
    usage: Usage;
}
export declare class JevClient {
    private options;
    constructor(options: ClientOptions);
    evaluate(body: Record<string, unknown>): Promise<{
        response: JevResponse;
        cached: boolean;
    }>;
}
export declare function applyJev(c: Candidate, response: JevResponse, cached: boolean, config: Config): Candidate;
