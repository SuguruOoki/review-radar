import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { Config, Report } from './types.js';
import { scan } from './scanner.js';

export async function demo(out: string, config: Config): Promise<Report> {
  const root = mkdtempSync(join(tmpdir(), 'review-radar-demo-'));
  const put = (path: string, text: string): void => { mkdirSync(dirname(join(root,path)),{recursive:true}); writeFileSync(join(root,path),text); };
  const run = (...args: string[]): string => execFileSync('git', ['-C',root,...args], { encoding:'utf8', stdio:['ignore','pipe','pipe'] });
  try {
    run('init','-b','main'); run('config','user.name','Review Radar Demo'); run('config','user.email','demo@example.invalid');
    put('src/billing/retryPayment.ts', `import { gateway } from '../gateway';\n\nexport async function retryPayment(order: { id: string; amount: number }) {\n  return gateway.charge({ amount: order.amount, idempotencyKey: order.id });\n}\n`);
    put('src/gateway.ts', `// Demo adapter only. No real payment processing.\nexport const gateway = { charge: async (args: { amount: number; idempotencyKey?: string }) => ({ id: 'demo', ...args }) };\n`);
    put('src/auth/canView.ts', `export function canView(user: { tenantId: string }, document: { tenantId: string }) {\n  return user.tenantId === document.tenantId;\n}\n`);
    put('src/queue/retry.ts', `export function retryLimit() {\n  return 1;\n}\n`);
    put('src/pricing/serviceFee.ts', `export function serviceFee(price: number): number {\n  if (price <= 0) {\n    throw new Error('price must be positive');\n  }\n  return Math.floor(price * 0.15);\n}\n`);
    put('src/ui/title.ts', `export const title = 'Welcome';\n`);
    put('src/ui/footer.ts', `export const footer = 'All rights reserved';\n`);
    put('src/ui/button.ts', `export const label = 'Submit';\n`);
    put('src/ui/help.ts', `export const help = 'Contact support';\n`);
    put('README.md', '# Demo\n\nExample application.\n');
    put('tests/retryPayment.test.ts', `// Illustrative test source; this file is not executed by Review Radar.\nimport { retryPayment } from '../src/billing/retryPayment';\nimport { expect, test } from 'vitest';\ntest('returns a result', async () => {\n  const result = await retryPayment({ id: 'order-1', amount: 100 });\n  expect(result.id).toBe('demo');\n});\n`);
    run('add','.'); run('commit','-m','demo baseline');
    put('src/billing/retryPayment.ts', `import { gateway } from '../gateway';\n\nexport async function retryPayment(order: { id: string; amount: number }) {\n  // Retry after a timeout. Does the original request already have a result?\n  return gateway.charge({ amount: order.amount });\n}\n`);
    put('src/auth/canView.ts', `export function canView(user: { tenantId: string }, document: { tenantId: string }) {\n  return Boolean(user);\n}\n`);
    put('migrations/20260919_reset.sql', `-- DEMO ONLY. Never execute this fixture on a database.\nDROP TABLE payment_attempts;\n`);
    put('src/queue/retry.ts', `export function retryLimit() {\n  return 5;\n}\n`);
    put('src/pricing/serviceFee.ts', `export function serviceFee(price: number, report: { user: { wallet: { balance: number } } }): number {\n  const fee = Math.floor(price * 0.15);\n  report.user.wallet.balance = report.user.wallet.balance - fee;\n  return fee;\n}\n`);
    put('src/ui/title.ts', `export const title = 'Welcome back';\n`);
    put('src/ui/footer.ts', `export const footer = 'Thank you for visiting';\n`);
    put('src/ui/button.ts', `export const label = 'Continue';\n`);
    put('src/ui/help.ts', `export const help = 'Ask us a question';\n`);
    put('README.md', '# Demo\n\nExample application for a review-priority report.\n');
    run('add','.'); run('commit','-m','demo changes needing review');
    const report = await scan({ repo: root, base: 'HEAD~1', head: 'HEAD', provider: 'heuristic', out, config });
    report.demo = true; report.repository.name = 'demo-commerce';
    return report;
  } finally { rmSync(root, { recursive: true, force: true }); }
}
