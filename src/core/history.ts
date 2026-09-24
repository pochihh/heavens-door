import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Checkpoint } from '../shared';
const run = promisify(execFile);

export class History {
  available = false;
  constructor(private root: string) {}
  private async git(args: string[]) {
    return (await run('git', args, { cwd: this.root, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } })).stdout.trim();
  }
  async initialize() {
    // Do not adopt a user's existing index or an enclosing source repository.
    let existing = '';
    try { existing = await this.git(['rev-parse', '--show-toplevel']); } catch { /* new workspace */ }
    if (existing) {
      try { this.available = existing === this.root && await this.git(['config', '--get', 'heavensDoor.managed']) === 'true'; } catch { /* unowned repository */ }
      return;
    }
    await this.git(['init', '-b', 'main']);
    await this.git(['config', 'heavensDoor.managed', 'true']);
    this.available = true;
  }
  private async ready() {
    if (!this.available) throw new Error('History is unavailable for an existing repository. Its branches and staging are left untouched.');
    if (['MERGE_HEAD','CHERRY_PICK_HEAD','REVERT_HEAD','rebase-merge','rebase-apply'].some(p => existsSync(join(this.root,'.git',p)))) throw new Error('Finish the terminal Git operation before using app history.');
    if (await this.git(['diff','--cached','--name-only'])) throw new Error('The Git index has staged changes. Commit or unstage them in the terminal first.');
  }
  async checkpoint(label: string) {
    await this.ready();
    if (!(await this.git(['status','--porcelain']))) return;
    // This repository is explicitly app-managed; any user staging pauses history.
    await this.git(['add','--all','--','.']);
    try {
      await this.git(['-c','user.name=Heaven’s Door','-c','user.email=local@heavens-door.invalid','commit','-m',label.slice(0,200)]);
    } catch (error) {
      throw new Error(`Checkpoint failed; staged files are preserved: ${String(error)}`,{cause:error});
    }
  }
  async list(): Promise<Checkpoint[]> {
    if (!this.available) return [];
    let head = '';
    try { head = await this.git(['rev-parse','HEAD']); } catch { return []; }
    // ponytail: show 200 checkpoints; page Git's log when deeper navigation is needed.
    const lines = await this.git(['log','--all','--date-order','-200','--format=%H%x09%P%x09%ct%x09%s']);
    return lines.split('\n').filter(Boolean).map(line => {
      const [id, parents, time, ...label] = line.split('\t');
      return { id, parents: parents.split(' ').filter(Boolean), time: Number(time)*1000, label: label.join('\t'), active: id === head };
    });
  }
  async restore(id: string) {
    await this.ready();
    if (!/^[a-f0-9]{40,64}$/.test(id) || !(await this.list()).some(c => c.id === id)) throw new Error('Unknown checkpoint');
    await this.checkpoint('Preserve work before history navigation');
    // Git refuses unsafe checkout collisions; never force or reset away working data.
    await this.git(['switch','-c',`history/${randomUUID().slice(0,8)}`,id]);
  }
}
