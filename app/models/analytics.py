from sqlalchemy import BigInteger, String, Boolean, DateTime, Integer, ForeignKey, Text, JSON, Float, Enum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from app.core.database import Base
import enum
from datetime import datetime
from typing import Optional, List


class SentimentType(str, enum.Enum):
    POSITIVE = "positive"
    NEGATIVE = "negative"
    NEUTRAL = "neutral"
    MIXED = "mixed"


class PostAnalytics(Base):
    __tablename__ = "post_analytics"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    post_id: Mapped[int] = mapped_column(Integer, ForeignKey("posts.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)

    # Core metrics
    views: Mapped[int] = mapped_column(Integer, default=0)
    reactions_total: Mapped[int] = mapped_column(Integer, default=0)
    reactions_breakdown: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    # {"👍": 10, "❤️": 5, "🔥": 3, ...}
    comments_count: Mapped[int] = mapped_column(Integer, default=0)
    forwards: Mapped[int] = mapped_column(Integer, default=0)

    # Audience changes after post
    subscribers_gained: Mapped[int] = mapped_column(Integer, default=0)
    subscribers_lost: Mapped[int] = mapped_column(Integer, default=0)

    # Calculated metrics
    engagement_rate: Mapped[float] = mapped_column(Float, default=0.0)
    reach_rate: Mapped[float] = mapped_column(Float, default=0.0)

    # AI analysis
    ai_analysis: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    ai_recommendations: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    sentiment: Mapped[Optional[SentimentType]] = mapped_column(Enum(SentimentType), nullable=True)

    # Comment analysis summary
    comments_sentiment: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    # {"positive": 10, "negative": 2, "neutral": 5, "toxic": 1, "spam": 3, "ads": 2}
    toxic_comments_count: Mapped[int] = mapped_column(Integer, default=0)
    spam_comments_count: Mapped[int] = mapped_column(Integer, default=0)
    ads_comments_count: Mapped[int] = mapped_column(Integer, default=0)

    # Timestamps
    first_collected_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    post: Mapped["Post"] = relationship("Post", back_populates="analytics")

    def __repr__(self):
        return f"<PostAnalytics post_id={self.post_id} views={self.views} er={self.engagement_rate:.2f}>"


class ChannelAnalytics(Base):
    __tablename__ = "channel_analytics"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    channel_id: Mapped[int] = mapped_column(Integer, ForeignKey("channels.id", ondelete="CASCADE"), nullable=False, index=True)

    date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)

    subscribers_count: Mapped[int] = mapped_column(Integer, default=0)
    subscribers_delta: Mapped[int] = mapped_column(Integer, default=0)
    posts_count: Mapped[int] = mapped_column(Integer, default=0)
    avg_views: Mapped[float] = mapped_column(Float, default=0.0)
    avg_engagement_rate: Mapped[float] = mapped_column(Float, default=0.0)
    total_reactions: Mapped[int] = mapped_column(Integer, default=0)
    total_comments: Mapped[int] = mapped_column(Integer, default=0)

    # Best posting times (from adaptive scheduling)
    best_hours: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    # {"hour": engagement_rate, ...}

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    channel: Mapped["Channel"] = relationship("Channel", back_populates="analytics")

    def __repr__(self):
        return f"<ChannelAnalytics channel_id={self.channel_id} date={self.date}>"


class CommentRecord(Base):
    __tablename__ = "comment_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    post_id: Mapped[int] = mapped_column(Integer, ForeignKey("posts.id", ondelete="CASCADE"), nullable=False, index=True)
    channel_id: Mapped[int] = mapped_column(Integer, ForeignKey("channels.id", ondelete="CASCADE"), nullable=False, index=True)

    telegram_message_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    author_id: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    author_username: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # AI classification
    sentiment: Mapped[Optional[SentimentType]] = mapped_column(Enum(SentimentType), nullable=True)
    is_toxic: Mapped[bool] = mapped_column(Boolean, default=False)
    is_spam: Mapped[bool] = mapped_column(Boolean, default=False)
    is_ads: Mapped[bool] = mapped_column(Boolean, default=False)
    toxicity_score: Mapped[float] = mapped_column(Float, default=0.0)

    # Actions taken
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    is_hidden: Mapped[bool] = mapped_column(Boolean, default=False)
    author_banned: Mapped[bool] = mapped_column(Boolean, default=False)
    bot_replied: Mapped[bool] = mapped_column(Boolean, default=False)
    bot_reply_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    analyzed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    def __repr__(self):
        return f"<CommentRecord id={self.id} post_id={self.post_id} sentiment={self.sentiment}>"
