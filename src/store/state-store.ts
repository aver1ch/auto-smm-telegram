import fs from "node:fs";
import path from "node:path";

import { normalizeTarget } from "../target-defaults.js";
import type { AppState, TargetChannel, TelegramAccount } from "../types.js";

const initialState: AppState = {
  accounts: [],
  targets: []
};

export class StateStore {
  private state: AppState;

  constructor(private readonly filePath: string) {
    this.state = this.load();
  }

  listAccounts(): TelegramAccount[] {
    return [...this.state.accounts];
  }

  getAccount(accountId: string): TelegramAccount | undefined {
    return this.state.accounts.find((account) => account.id === accountId);
  }

  saveAccount(account: TelegramAccount): TelegramAccount {
    const index = this.state.accounts.findIndex((item) => item.id === account.id);
    if (index >= 0) {
      this.state.accounts[index] = account;
    } else {
      this.state.accounts.push(account);
    }

    this.persist();
    return account;
  }

  listTargets(): TargetChannel[] {
    return [...this.state.targets];
  }

  getTarget(targetId: string): TargetChannel | undefined {
    return this.state.targets.find((target) => target.id === targetId);
  }

  saveTarget(target: TargetChannel): TargetChannel {
    const normalizedTarget = normalizeTarget(target);
    const index = this.state.targets.findIndex((item) => item.id === target.id);
    if (index >= 0) {
      this.state.targets[index] = normalizedTarget;
    } else {
      this.state.targets.push(normalizedTarget);
    }

    this.persist();
    return normalizedTarget;
  }

  private load(): AppState {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });

    if (!fs.existsSync(this.filePath)) {
      this.writeFile(initialState);
      return structuredClone(initialState);
    }

    const raw = fs.readFileSync(this.filePath, "utf8");
    if (!raw.trim()) {
      this.writeFile(initialState);
      return structuredClone(initialState);
    }

    const parsed = {
      ...initialState,
      ...(JSON.parse(raw) as AppState)
    };

    return {
      ...parsed,
      targets: (parsed.targets ?? []).map((target) => normalizeTarget(target))
    };
  }

  private persist(): void {
    this.writeFile(this.state);
  }

  private writeFile(state: AppState): void {
    const tempFile = `${this.filePath}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(state, null, 2));
    fs.renameSync(tempFile, this.filePath);
  }
}
