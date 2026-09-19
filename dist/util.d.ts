export declare function hash(value: unknown): string;
export declare function stableJson(v: unknown): string;
export declare function assert(condition: unknown, message: string): asserts condition;
export declare function object(v: unknown): v is Record<string, unknown>;
export declare function finite(v: unknown): v is number;
export declare function bounded(v: unknown, min: number, max: number): v is number;
export declare function clamp(n: number, min?: number, max?: number): number;
export declare function round(n: number, digits?: number): number;
export declare function html(s: unknown): string;
export declare function md(s: unknown): string;
export declare function safeMessage(e: unknown): string;
export declare function safeRelative(path: string): boolean;
export declare function safeLocalRead(root: string, path: string, maxBytes: number): string;
export declare function readProvided(path: string, maxBytes?: number): string;
export declare function secureDir(path: string): void;
export declare function atomicWrite(path: string, contents: string): void;
export declare function globMatch(path: string, pattern: string): boolean;
export declare function sensitivePath(path: string): boolean;
/** Best-effort masking, not a data-loss-prevention guarantee. All remote use still needs explicit consent. */
export declare function redact(text: string): {
    text: string;
    count: number;
};
export declare function redactDeep<T>(v: T): {
    value: T;
    count: number;
};
export declare function entropy(probabilities: Record<string, number>): number;
