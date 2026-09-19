import { type Config } from './types.js';
export declare const DEFAULT_CONFIG: Config;
export declare function loadConfig(path?: string): Config;
export declare function validateConfig(c: Config): void;
