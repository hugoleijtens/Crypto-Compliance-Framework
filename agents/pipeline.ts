import fs from 'node:fs/promises';
import path from 'node:path';
import { AgentLogger } from './logger';
import { runScout } from './scout';
import { runTriage } from './triage';
import { runCanonicalizer } from './canonicalizer';
import { runSafetyGate } from './safetyGate';

function runIdFromNow(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

export async function runPipeline(opts?: { rootDirAbs?: string }): Promise<{
  runId: string;
  scout: Awaited<ReturnType<typeof runScout>>;
  triage: Awaited<ReturnType<typeof runTriage>>;
  canonicalizer: Awaited<ReturnType<typeof runCanonicalizer>>;
  safetyGate: Awaited<ReturnType<typeof runSafetyGate>>;
}> {
  const rootDirAbs = opts?.rootDirAbs ?? process.cwd();
  const runId = runIdFromNow();
  const logger = new AgentLogger({ rootDirAbs, runId });

  await logger.log({
    agent: 'pipeline',
    action: 'run.start',
    message: runId
  });

  await fs.mkdir(path.join(rootDirAbs, 'audit', 'runs'), { recursive: true });

  const scout = await runScout({ rootDirAbs, logger });
  const triage = await runTriage({ rootDirAbs, logger });
  const canonicalizer = await runCanonicalizer({ rootDirAbs, logger });
  const safetyGate = await runSafetyGate({
    rootDirAbs,
    logger,
    candidateFiles: canonicalizer.createdDraftFiles
  });

  const summary = {
    runId,
    generatedAt: new Date().toISOString(),
    scout,
    triage,
    canonicalizer,
    safetyGate
  };

  await fs.writeFile(
    path.join(rootDirAbs, 'audit', 'runs', `${runId}.json`),
    JSON.stringify(summary, null, 2) + '\n',
    'utf8'
  );

  await logger.log({
    agent: 'pipeline',
    action: 'run.done',
    message: runId
  });

  return { runId, scout, triage, canonicalizer, safetyGate };
}
