import type { ApprovalConfig, PendingApproval, TargetChannel } from "./types.js";

export function createDefaultApprovalConfig(): ApprovalConfig {
  return {
    posts: {
      enabled: false,
      timeoutMinutes: 30,
      onTimeout: "skip"
    },
    comments: {
      enabled: false,
      timeoutMinutes: 30,
      onTimeout: "skip"
    }
  };
}

type PartialTargetApproval = Partial<ApprovalConfig> & {
  posts?: Partial<ApprovalConfig["posts"]>;
  comments?: Partial<ApprovalConfig["comments"]>;
};

type TargetWithOptionalApproval = TargetChannel & {
  approval?: PartialTargetApproval;
  pendingApprovals?: PendingApproval[];
};

export function normalizeTarget(target: TargetWithOptionalApproval): TargetChannel {
  const approvalDefaults = createDefaultApprovalConfig();

  return {
    ...target,
    approval: {
      posts: {
        ...approvalDefaults.posts,
        ...(target.approval?.posts || {})
      },
      comments: {
        ...approvalDefaults.comments,
        ...(target.approval?.comments || {})
      }
    },
    pendingApprovals: target.pendingApprovals ?? []
  };
}
