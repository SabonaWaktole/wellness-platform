import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * FR-REN-10: nothing renews automatically. No scheduled job creates a contract
 * or a deal, or calls the use cases that do; a renewal is always a person's
 * action. The jobs are read as text so a new one cannot slip past a test list.
 */
describe('FR-REN-10 no job renews a contract on its own', () => {
  const dir = join(__dirname, '../../../src/scheduler');
  const files = [
    ...readdirSync(join(dir, 'jobs')).map((name) => join(dir, 'jobs', name)),
    join(dir, 'createScheduler.ts'),
    join(dir, 'PrismaSchedulerQueries.ts'),
  ].filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'));

  const creates = [
    /\b(?:contract|deal)\.create(?:Many)?\s*\(/,
    /\bContract\.create\s*\(/,
    /\bDeal\.open(?:Renewal)?\s*\(/,
    /CreateContractFromDealUseCase/,
    /StartRenewalUseCase/,
    /RenewContractUseCase/,
    /CreateContractUseCase/,
    /CreateDealUseCase/,
  ];

  it.each(files.map((file) => [file.slice(dir.length + 1), file]))('%s creates no contract or deal', (_name, file) => {
    const source = readFileSync(file, 'utf8')
      .split('\n')
      .filter((line) => !line.trim().startsWith('*') && !line.trim().startsWith('//') && !line.trim().startsWith('/*'))
      .join('\n');
    for (const pattern of creates) expect(source).not.toMatch(pattern);
  });
});
