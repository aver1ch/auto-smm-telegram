import { Buffer } from "node:buffer";

import { Api, utils } from "telegram";
import { TelegramClient } from "telegram/client/TelegramClient.js";
import { CustomFile } from "telegram/client/uploads.js";
import { StringSession } from "telegram/sessions/StringSession.js";

import { Logger } from "../logger.js";
import type {
  AnalyticsSnapshot,
  ChannelMeta,
  DiscussionThreadInfo,
  GeneratedDraft,
  PostMetricsSnapshot,
  PublishedMessageResult,
  SourceMessage,
  TelegramAccount
} from "../types.js";

interface EntityLike {
  title?: string;
  username?: string;
  id?: bigint | number | string | { toString(): string };
}

interface DiscussionThreadData extends DiscussionThreadInfo {
  discussionPeer: Api.TypeInputPeer;
}

function buildPermalink(entity: EntityLike, messageId: number): string | undefined {
  if (entity.username) {
    return `https://t.me/${entity.username}/${messageId}`;
  }

  return undefined;
}

function normalizeDataUrl(dataUrl: string): { mimeType: string; bytes: Buffer } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match?.[1] || !match[2]) {
    throw new Error("Invalid image data URL");
  }

  return {
    mimeType: match[1],
    bytes: Buffer.from(match[2], "base64")
  };
}

function toIsoDate(value: Date | number | undefined): string {
  if (typeof value === "number") {
    return new Date(value * 1000).toISOString();
  }

  return (value ?? new Date()).toISOString();
}

function sumReactionCounts(reactions: Api.MessageReactions | undefined): number {
  return reactions?.results.reduce((total, item) => total + item.count, 0) ?? 0;
}

function toPeerRef(entity: EntityLike): string {
  if (entity.username) {
    return `@${entity.username}`;
  }

  return entity.id ? String(entity.id) : "unknown";
}

function parseGraphSeries(jsonText: string): Array<{ timestamp: string; value: number }> | undefined {
  try {
    const payload = JSON.parse(jsonText) as {
      columns?: unknown[][];
      types?: Record<string, string>;
    };

    const { columns, types } = payload;
    if (!Array.isArray(columns) || !types) {
      return undefined;
    }

    const xColumn = columns.find((column) => Array.isArray(column) && typeof column[0] === "string" && types[column[0]] === "x");
    const yColumn = columns.find(
      (column) =>
        Array.isArray(column) &&
        typeof column[0] === "string" &&
        column !== xColumn &&
        ["line", "bar", "area", "step"].includes(types[column[0]] || "")
    );

    if (!xColumn || !yColumn) {
      return undefined;
    }

    const timestamps = xColumn.slice(1);
    const values = yColumn.slice(1);
    const length = Math.min(timestamps.length, values.length);

    return Array.from({ length }, (_, index) => ({
      timestamp: new Date(Number(timestamps[index])).toISOString(),
      value: Number(values[index])
    })).filter((item) => Number.isFinite(Date.parse(item.timestamp)) && Number.isFinite(item.value));
  } catch {
    return undefined;
  }
}

function extractFirstMessage(messages: Api.Message[]): Api.Message | undefined {
  return messages.find((message) => typeof message.id === "number");
}

export class TelegramAccountService {
  private readonly clients = new Map<string, TelegramClient>();

  constructor(private readonly logger: Logger) {}

  async verifyAccount(account: TelegramAccount): Promise<{ displayName: string }> {
    const client = await this.getClient(account);
    const me = await client.getMe();
    const displayName = [me?.firstName, me?.lastName].filter(Boolean).join(" ").trim() || String(me?.username || account.name);

    return { displayName };
  }

  async resolveChannel(account: TelegramAccount, channelRef: string): Promise<ChannelMeta> {
    const client = await this.getClient(account);
    const entity = (await client.getEntity(channelRef)) as unknown as EntityLike;

    return {
      title: entity.title || channelRef,
      username: entity.username,
      id: entity.id ? String(entity.id) : undefined
    };
  }

  async fetchRecentPosts(account: TelegramAccount, referenceId: string, channelRef: string, limit: number): Promise<SourceMessage[]> {
    const client = await this.getClient(account);
    const entity = (await client.getEntity(channelRef)) as unknown as EntityLike;
    const messages = (await client.getMessages(channelRef, {
      limit
    })) as Api.Message[];

    return messages
      .filter((message) => typeof message.id === "number" && typeof message.message === "string" && message.message.trim().length > 0)
      .map((message) => ({
        referenceId,
        channelRef,
        channelTitle: entity.title || channelRef,
        messageId: message.id,
        date: toIsoDate(message.date),
        text: message.message.trim(),
        permalink: buildPermalink(entity, message.id)
      }))
      .sort((left, right) => right.messageId - left.messageId);
  }

  async publishDraft(
    account: TelegramAccount,
    channelRef: string,
    draft: GeneratedDraft,
    options?: { scheduleAt?: Date }
  ): Promise<PublishedMessageResult> {
    const client = await this.getClient(account);
    const entity = await client.getEntity(channelRef);
    const scheduleAt = options?.scheduleAt;
    const scheduleAtUnix = scheduleAt ? Math.floor(scheduleAt.getTime() / 1000) : undefined;

    let message: Api.Message;

    if (draft.imageDataUrl) {
      const { bytes } = normalizeDataUrl(draft.imageDataUrl);
      const file = new CustomFile("generated-image.png", bytes.length, "", bytes);

      message = await client.sendFile(entity, {
        file,
        caption: draft.text,
        forceDocument: false,
        scheduleDate: scheduleAtUnix
      });
    } else {
      message = await client.sendMessage(entity, {
        message: draft.text,
        schedule: scheduleAtUnix
      });
    }

    let discussion: DiscussionThreadInfo | undefined;
    if (!scheduleAt) {
      discussion = await this.resolveDiscussionThread(account, channelRef, message.id);
    }

    return {
      messageId: message.id,
      publishedAt: toIsoDate(message.date),
      scheduledFor: scheduleAt?.toISOString(),
      discussion
    };
  }

  async resolveDiscussionThread(
    account: TelegramAccount,
    channelRef: string,
    messageId: number
  ): Promise<DiscussionThreadInfo | undefined> {
    const client = await this.getClient(account);
    const discussion = await this.getDiscussionThreadData(client, channelRef, messageId);

    if (!discussion) {
      return undefined;
    }

    return {
      discussionPeerRef: discussion.discussionPeerRef,
      discussionRootMessageId: discussion.discussionRootMessageId
    };
  }

  async commentAsChannel(
    account: TelegramAccount,
    referenceChannelRef: string,
    referencePostId: number,
    commentText: string,
    sendAsRef: string
  ): Promise<PublishedMessageResult | null> {
    const client = await this.getClient(account);
    const discussion = await this.getDiscussionThreadData(client, referenceChannelRef, referencePostId);
    if (!discussion) {
      return null;
    }

    const canSendAs = await this.canSendAs(client, discussion.discussionPeer, sendAsRef);
    if (!canSendAs) {
      return null;
    }

    await client.invoke(new Api.messages.SaveDefaultSendAs({
      peer: discussion.discussionPeer,
      sendAs: await client.getInputEntity(sendAsRef)
    }));

    const sent = await client.sendMessage(discussion.discussionPeer, {
      message: commentText,
      replyTo: discussion.discussionRootMessageId
    });

    return {
      messageId: sent.id,
      publishedAt: toIsoDate(sent.date)
    };
  }

  async fetchPostMetrics(account: TelegramAccount, channelRef: string, messageId: number): Promise<PostMetricsSnapshot> {
    const client = await this.getClient(account);
    const inputPeer = await client.getInputEntity(channelRef);

    const viewsResponse = await client.invoke(new Api.messages.GetMessagesViews({
      peer: inputPeer,
      id: [messageId],
      increment: false
    }));

    const messages = (await client.getMessages(channelRef, {
      ids: [messageId]
    })) as Api.Message[];

    const message = extractFirstMessage(messages);
    const viewsEntry = viewsResponse.views[0];
    const views = viewsEntry?.views ?? message?.views ?? 0;
    const forwards = viewsEntry?.forwards ?? message?.forwards ?? 0;
    const replies = viewsEntry?.replies?.replies ?? message?.replies?.replies ?? 0;
    const reactions = sumReactionCounts(message?.reactions);
    const engagementRate = views > 0 ? (forwards + replies + reactions) / views : 0;

    return {
      collectedAt: new Date().toISOString(),
      views,
      forwards,
      reactions,
      replies,
      engagementRate
    };
  }

  async fetchChannelAnalytics(account: TelegramAccount, channelRef: string, recentMessageIds: number[]): Promise<AnalyticsSnapshot> {
    const client = await this.getClient(account);
    const inputPeer = await client.getInputEntity(channelRef);

    let followersCurrent: number | undefined;
    let followersPrevious: number | undefined;
    let followerDelta: number | undefined;
    let viewsPerPost: number | undefined;
    let sharesPerPost: number | undefined;
    let reactionsPerPost: number | undefined;
    let growthSeries: Array<{ timestamp: string; value: number }> | undefined;
    let recentInteractionIds: number[] = [];

    try {
      const stats = await client.invoke(new Api.stats.GetBroadcastStats({
        channel: inputPeer,
        dark: false
      }));

      followersCurrent = Number(stats.followers.current);
      followersPrevious = Number(stats.followers.previous);
      followerDelta = followersCurrent - followersPrevious;
      viewsPerPost = Number(stats.viewsPerPost.current);
      sharesPerPost = Number(stats.sharesPerPost.current);
      reactionsPerPost = Number(stats.reactionsPerPost.current);
      growthSeries = await this.loadGraphSeries(client, stats.growthGraph);
      recentInteractionIds = stats.recentPostsInteractions
        .map((item) => ("msgId" in item ? item.msgId : undefined))
        .filter((value): value is number => typeof value === "number");
    } catch (error) {
      this.logger.warn("Channel analytics via stats API failed; using fallback metrics", {
        channelRef,
        error: String(error)
      });
    }

    const mergedMessageIds = Array.from(new Set([...recentMessageIds, ...recentInteractionIds])).slice(-10);
    const recentPosts = await Promise.all(
      mergedMessageIds.map(async (messageId) => {
        const metrics = await this.fetchPostMetrics(account, channelRef, messageId);
        return {
          messageId,
          views: metrics.views,
          forwards: metrics.forwards,
          reactions: metrics.reactions,
          replies: metrics.replies
        };
      })
    );

    return {
      collectedAt: new Date().toISOString(),
      followersCurrent,
      followersPrevious,
      followerDelta,
      viewsPerPost,
      sharesPerPost,
      reactionsPerPost,
      growthSeries,
      recentPosts
    };
  }

  async listThreadComments(
    account: TelegramAccount,
    discussionPeerRef: string,
    rootMessageId: number,
    limit: number,
    minMessageId = 0
  ): Promise<Api.Message[]> {
    const client = await this.getClient(account);
    const messages = (await client.getMessages(discussionPeerRef, {
      replyTo: rootMessageId,
      limit
    })) as Api.Message[];

    return messages
      .filter((message) => message.id > minMessageId)
      .sort((left, right) => left.id - right.id);
  }

  async deleteMessages(account: TelegramAccount, peerRef: string, messageIds: number[]): Promise<void> {
    if (messageIds.length === 0) {
      return;
    }

    const client = await this.getClient(account);
    await client.deleteMessages(peerRef, messageIds, {
      revoke: true
    });
  }

  private async canSendAs(client: TelegramClient, discussionPeer: Api.TypeInputPeer, sendAsRef: string): Promise<boolean> {
    const sendAsInput = await client.getInputEntity(sendAsRef);
    const wantedPeerId = await client.getPeerId(sendAsInput, false);
    const result = await client.invoke(new Api.channels.GetSendAs({
      peer: discussionPeer
    }));

    return result.peers.some((peer) => utils.getPeerId(peer.peer, false) === wantedPeerId);
  }

  private async loadGraphSeries(
    client: TelegramClient,
    graph: Api.TypeStatsGraph
  ): Promise<Array<{ timestamp: string; value: number }> | undefined> {
    if (graph instanceof Api.StatsGraph) {
      return parseGraphSeries(graph.json.data);
    }

    if (graph instanceof Api.StatsGraphAsync) {
      const loaded = await client.invoke(new Api.stats.LoadAsyncGraph({
        token: graph.token
      }));

      if (loaded instanceof Api.StatsGraph) {
        return parseGraphSeries(loaded.json.data);
      }
    }

    return undefined;
  }

  private async getDiscussionThreadData(
    client: TelegramClient,
    channelRef: string,
    messageId: number
  ): Promise<DiscussionThreadData | undefined> {
    try {
      const inputPeer = await client.getInputEntity(channelRef);
      const result = await client.invoke(new Api.messages.GetDiscussionMessage({
        peer: inputPeer,
        msgId: messageId
      }));

      const messages = result.messages.filter((message): message is Api.Message => message instanceof Api.Message);
      const relevantMessage = messages.reduce<Api.Message | undefined>(
        (current, item) => (!current || item.id < current.id ? item : current),
        undefined
      );

      if (!relevantMessage?.peerId) {
        return undefined;
      }

      const peerId = utils.getPeerId(relevantMessage.peerId, false);
      const chat = result.chats.find((item) => {
        const itemPeer = utils.getInputPeer(item, false, false);
        return itemPeer ? utils.getPeerId(itemPeer, false) === peerId : false;
      }) as EntityLike | undefined;

      if (!chat) {
        return undefined;
      }

      return {
        discussionPeer: utils.getInputPeer(chat, false, false),
        discussionPeerRef: toPeerRef(chat),
        discussionRootMessageId: relevantMessage.id
      };
    } catch (error) {
      this.logger.debug("Discussion thread is unavailable", {
        channelRef,
        messageId,
        error: String(error)
      });
      return undefined;
    }
  }

  private async getClient(account: TelegramAccount): Promise<TelegramClient> {
    const cached = this.clients.get(account.id);
    if (cached) {
      return cached;
    }

    this.logger.debug("Opening Telegram session", { accountId: account.id, name: account.name });

    const client = new TelegramClient(new StringSession(account.sessionString), account.apiId, account.apiHash, {
      connectionRetries: 5
    });

    await client.connect();
    this.clients.set(account.id, client);
    return client;
  }
}
