import { Logger } from "../logger.js";
import { StateStore } from "../store/state-store.js";
import type { PendingApproval, TargetChannel } from "../types.js";
import { CommunityService } from "./community-service.js";
import { ContentService } from "./content-service.js";

export type ApprovalNotificationEvent =
  | "requested"
  | "approved"
  | "rejected"
  | "timeout_published"
  | "timeout_skipped"
  | "failed";

export interface ApprovalNotification {
  event: ApprovalNotificationEvent;
  target: TargetChannel;
  approval: PendingApproval;
  detail?: string;
}

interface PendingApprovalRef {
  target: TargetChannel;
  approval: PendingApproval;
}

interface ApprovalResolution extends PendingApprovalRef {
  event: ApprovalNotificationEvent;
}

export class ApprovalService {
  private notifier?: (notification: ApprovalNotification) => Promise<void>;

  constructor(
    private readonly store: StateStore,
    private readonly contentService: ContentService,
    private readonly communityService: CommunityService,
    private readonly logger: Logger
  ) {}

  setNotifier(notifier: (notification: ApprovalNotification) => Promise<void>): void {
    this.notifier = notifier;
  }

  listPendingApprovals(targetId?: string): PendingApprovalRef[] {
    const targets = targetId ? [this.requireTarget(targetId)] : this.store.listTargets();

    return targets
      .flatMap((target) =>
        target.pendingApprovals.map((approval) => ({
          target,
          approval
        }))
      )
      .sort((left, right) => Date.parse(left.approval.createdAt) - Date.parse(right.approval.createdAt));
  }

  async notifyPendingApprovals(approvals: PendingApproval[]): Promise<void> {
    for (const approval of approvals) {
      const target = this.store.getTarget(approval.targetId);
      if (!target) {
        continue;
      }

      await this.emit({
        event: "requested",
        target,
        approval
      });
    }
  }

  async approve(approvalId: string): Promise<ApprovalResolution> {
    return this.resolve(approvalId, "approve", "manual");
  }

  async reject(approvalId: string): Promise<ApprovalResolution> {
    return this.resolve(approvalId, "reject", "manual");
  }

  async runTimeoutCycle(): Promise<void> {
    const now = Date.now();
    const expired = this.listPendingApprovals().filter((item) => Date.parse(item.approval.expiresAt) <= now);

    for (const item of expired) {
      try {
        await this.resolve(
          item.approval.id,
          item.approval.timeoutAction === "publish" ? "approve" : "reject",
          "timeout"
        );
      } catch (error) {
        this.logger.error("Approval timeout handling failed", {
          approvalId: item.approval.id,
          error: String(error)
        });
      }
    }
  }

  private async resolve(
    approvalId: string,
    action: "approve" | "reject",
    source: "manual" | "timeout"
  ): Promise<ApprovalResolution> {
    const current = this.findPendingApproval(approvalId);
    const { target, approval } = current;

    try {
      if (approval.kind === "post") {
        if (action === "approve") {
          await this.contentService.publishSpecificDraft(target.id, approval.draft);
        } else {
          this.removePendingApproval(target.id, approval.id);
        }
      } else if (action === "approve") {
        const result = await this.communityService.publishApprovedComment(target.id, approval);
        if (result !== "posted") {
          const blockedTarget = this.requireTarget(target.id);
          await this.emit({
            event: "failed",
            target: blockedTarget,
            approval,
            detail: "Discussion thread missing or send-as unavailable during approval publish"
          });
          return {
            target: blockedTarget,
            approval,
            event: "failed"
          };
        }
      } else {
        await this.communityService.skipApprovedComment(
          target.id,
          approval,
          source === "timeout" ? "Approval timeout reached; comment skipped" : "Rejected by admin"
        );
      }
    } catch (error) {
      this.removePendingApproval(target.id, approval.id);
      const updatedTarget = this.requireTarget(target.id);
      await this.emit({
        event: "failed",
        target: updatedTarget,
        approval,
        detail: String(error)
      });
      throw error;
    }

    const event: ApprovalNotificationEvent =
      source === "timeout"
        ? action === "approve"
          ? "timeout_published"
          : "timeout_skipped"
        : action === "approve"
          ? "approved"
          : "rejected";
    const updatedTarget = this.requireTarget(target.id);
    await this.emit({
      event,
      target: updatedTarget,
      approval
    });

    return {
      target: updatedTarget,
      approval,
      event
    };
  }

  private findPendingApproval(approvalId: string): PendingApprovalRef {
    const found = this.listPendingApprovals().find((item) => item.approval.id === approvalId);
    if (!found) {
      throw new Error(`Pending approval not found or already resolved: ${approvalId}`);
    }

    return found;
  }

  private removePendingApproval(targetId: string, approvalId: string): void {
    const target = this.requireTarget(targetId);
    this.store.saveTarget({
      ...target,
      pendingApprovals: target.pendingApprovals.filter((item) => item.id !== approvalId),
      updatedAt: new Date().toISOString()
    });
  }

  private requireTarget(targetId: string): TargetChannel {
    const target = this.store.getTarget(targetId);
    if (!target) {
      throw new Error(`Target channel not found: ${targetId}`);
    }

    return target;
  }

  private async emit(notification: ApprovalNotification): Promise<void> {
    if (!this.notifier) {
      return;
    }

    try {
      await this.notifier(notification);
    } catch (error) {
      this.logger.warn("Approval notifier failed", {
        event: notification.event,
        approvalId: notification.approval.id,
        error: String(error)
      });
    }
  }
}
