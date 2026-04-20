import { OpenRouterClient } from "../openrouter/client.js";
import { StateStore } from "../store/state-store.js";
import { TelegramAccountService } from "../telegram/account-service.js";
import type { AnalyticsSnapshot, PublishedPostRecord, StrategyInsight, TargetChannel } from "../types.js";

function trimHistory<T>(items: T[], maxSize: number): T[] {
  return items.slice(Math.max(0, items.length - maxSize));
}

function buildAnalysisPayload(target: TargetChannel, snapshot: AnalyticsSnapshot, recentPosts: PublishedPostRecord[]): string {
  const growthSummary = snapshot.growthSeries?.slice(-10).map((point) => `${point.timestamp} => ${point.value}`).join("\n") || "none";
  const postSummary = recentPosts
    .map((post) => {
      const latest = post.metricsHistory.at(-1);
      return [
        `Post ${post.messageId} published at ${post.publishedAt}`,
        `Draft summary: ${post.draftSummary || "none"}`,
        `Metrics: views=${latest?.views ?? 0}, forwards=${latest?.forwards ?? 0}, reactions=${latest?.reactions ?? 0}, replies=${latest?.replies ?? 0}, engagementRate=${latest?.engagementRate ?? 0}`
      ].join("\n");
    })
    .join("\n\n");

  return [
    `Followers current: ${snapshot.followersCurrent ?? "n/a"}`,
    `Followers previous: ${snapshot.followersPrevious ?? "n/a"}`,
    `Follower delta: ${snapshot.followerDelta ?? "n/a"}`,
    `Views per post: ${snapshot.viewsPerPost ?? "n/a"}`,
    `Shares per post: ${snapshot.sharesPerPost ?? "n/a"}`,
    `Reactions per post: ${snapshot.reactionsPerPost ?? "n/a"}`,
    "",
    "Growth series:",
    growthSummary,
    "",
    "Recent published posts:",
    postSummary || "none"
  ].join("\n");
}

export class AnalyticsService {
  constructor(
    private readonly store: StateStore,
    private readonly telegramAccountService: TelegramAccountService,
    private readonly openRouterClient: OpenRouterClient
  ) {}

  async updateTargetAnalytics(targetId: string): Promise<TargetChannel> {
    const target = this.requireTarget(targetId);
    const account = this.requireAccount(target.accountId);
    const recentPosts = trimHistory(target.publishedPosts, 8);
    const recentMessageIds = recentPosts.map((post) => post.messageId);

    const snapshot = await this.telegramAccountService.fetchChannelAnalytics(account, target.channelRef, recentMessageIds);

    const postsWithMetrics = target.publishedPosts.map((post) => {
      const metric = snapshot.recentPosts.find((item) => item.messageId === post.messageId);
      if (!metric) {
        return post;
      }

      return {
        ...post,
        metricsHistory: trimHistory(
          [
            ...post.metricsHistory,
            {
              collectedAt: snapshot.collectedAt,
              views: metric.views,
              forwards: metric.forwards,
              reactions: metric.reactions,
              replies: metric.replies,
              engagementRate: metric.views > 0 ? (metric.forwards + metric.reactions + metric.replies) / metric.views : 0,
              followerDelta: snapshot.followerDelta
            }
          ],
          20
        )
      };
    });

    const strategy = await this.openRouterClient.analyzeStrategy(
      {
        ...target,
        publishedPosts: postsWithMetrics
      },
      buildAnalysisPayload(target, snapshot, trimHistory(postsWithMetrics, 8))
    );

    const strategyInsight: StrategyInsight = {
      updatedAt: new Date().toISOString(),
      summary: strategy.summary,
      doMoreOf: strategy.doMoreOf,
      avoid: strategy.avoid,
      recommendedPostingWindows: strategy.recommendedPostingWindows
    };

    const updatedTarget = this.store.saveTarget({
      ...target,
      publishedPosts: postsWithMetrics,
      analyticsHistory: trimHistory([...target.analyticsHistory, snapshot], 30),
      strategyInsight,
      updatedAt: new Date().toISOString()
    });

    return updatedTarget;
  }

  async runCycle(): Promise<void> {
    const targets = this.store.listTargets().filter((target) => target.publishedPosts.length > 0);
    for (const target of targets) {
      await this.updateTargetAnalytics(target.id);
    }
  }

  formatTargetAnalytics(target: TargetChannel): string {
    const latest = target.analyticsHistory.at(-1);
    if (!latest) {
      return "Аналитика пока не собиралась.";
    }

    const strategy = target.strategyInsight;
    const recentPosts = trimHistory(target.publishedPosts, 5)
      .map((post) => {
        const metric = post.metricsHistory.at(-1);
        return `• ${post.messageId}: views=${metric?.views ?? 0}, reactions=${metric?.reactions ?? 0}, replies=${metric?.replies ?? 0}, ER=${(metric?.engagementRate ?? 0).toFixed(3)}`;
      })
      .join("\n");

    return [
      `Followers: ${latest.followersCurrent ?? "n/a"} (delta ${latest.followerDelta ?? "n/a"})`,
      `Views/post: ${latest.viewsPerPost ?? "n/a"}`,
      `Reactions/post: ${latest.reactionsPerPost ?? "n/a"}`,
      `Shares/post: ${latest.sharesPerPost ?? "n/a"}`,
      "",
      `Strategy: ${strategy?.summary || "none"}`,
      strategy?.doMoreOf.length ? `Do more of: ${strategy.doMoreOf.join("; ")}` : "",
      strategy?.avoid.length ? `Avoid: ${strategy.avoid.join("; ")}` : "",
      strategy?.recommendedPostingWindows.length ? `Windows: ${strategy.recommendedPostingWindows.join("; ")}` : "",
      "",
      "Recent posts:",
      recentPosts || "none"
    ]
      .filter(Boolean)
      .join("\n");
  }

  private requireTarget(targetId: string): TargetChannel {
    const target = this.store.getTarget(targetId);
    if (!target) {
      throw new Error(`Target channel not found: ${targetId}`);
    }

    return target;
  }

  private requireAccount(accountId: string) {
    const account = this.store.getAccount(accountId);
    if (!account) {
      throw new Error(`Telegram account not found: ${accountId}`);
    }

    return account;
  }
}
