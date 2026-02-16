import fs from 'node:fs/promises';
import path from 'node:path';

export type AgentEvent = {
  ts: string;
  runId: string;
  agent: string;
  action: string;
  message: string;
  meta?: Record<string, unknown>;
};

export class AgentLogger {
  private logFileAbs: string;
  private runId: string;

  constructor(opts: { rootDirAbs: string; runId: string }) {
    this.runId = opts.runId;
    this.logFileAbs = path.join(opts.rootDirAbs, 'audit', 'agent-log.ndjson');
  }

  async log(event: Omit<AgentEvent, 'ts' | 'runId'>) {
    const row: AgentEvent = {
      ts: new Date().toISOString(),
      runId: this.runId,
      ...event
    };

    await fs.mkdir(path.dirname(this.logFileAbs), { recursive: true });
    await fs.appendFile(this.logFileAbs, `${JSON.stringify(row)}\n`, 'utf8');

    // Console is useful locally; CI logs remain minimal.
    // eslint-disable-next-line no-console
    console.log(`[${row.agent}] ${row.action}: ${row.message}`);
  }
}
