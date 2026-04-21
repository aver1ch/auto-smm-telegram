from sqlalchemy import BigInteger, String, Boolean, DateTime, Integer, ForeignKey, Text, JSON, Enum, Float
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from app.core.database import Base
import enum
from datetime import datetime
from typing import Optional, List


class PostStatus(str, enum.Enum):
    DRAFT = "draft"
    SCHEDULED = "scheduled"
    PUBLISHED = "published"
    FAILED = "failed"
    CANCELLED = "cancelled"


class ContentStyle(str, enum.Enum):
    EXPERT = "expert"
    PROVOCATIVE = "provocative"
    ENTERTAINING = "entertaining"
    INFORMATIONAL = "informational"
    PROMOTIONAL = "promotional"
    STORYTELLING = "storytelling"


class Post(Base):
    __tablename__ = "posts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    channel_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("channels.id", ondelete="SET NULL"), nullable=True, index=True)

    # Content
    title: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    hashtags: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    image_url: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    image_file_id: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    # Generation params
    topic: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    style: Mapped[Optional[ContentStyle]] = mapped_column(Enum(ContentStyle), nullable=True)
    language: Mapped[str] = mapped_column(String(10), default="ru")
    target_length: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    ai_model_used: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    generation_params: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    # Status
    status: Mapped[PostStatus] = mapped_column(Enum(PostStatus), default=PostStatus.DRAFT, nullable=False)
    telegram_message_id: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)

    # A/B test
    ab_test_group: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)  # "A" or "B"
    ab_test_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("ab_tests.id", ondelete="SET NULL"), nullable=True)

    # Timestamps
    scheduled_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="posts")
    channel: Mapped[Optional["Channel"]] = relationship("Channel", back_populates="posts")
    analytics: Mapped[Optional["PostAnalytics"]] = relationship("PostAnalytics", back_populates="post", uselist=False, cascade="all, delete-orphan")
    ab_test: Mapped[Optional["ABTest"]] = relationship("ABTest", back_populates="posts", foreign_keys=[ab_test_id])

    def __repr__(self):
        return f"<Post id={self.id} status={self.status}>"


class PostSchedule(Base):
    __tablename__ = "post_schedules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    channel_id: Mapped[int] = mapped_column(Integer, ForeignKey("channels.id", ondelete="CASCADE"), nullable=False, index=True)
    post_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("posts.id", ondelete="SET NULL"), nullable=True)

    scheduled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    is_executed: Mapped[bool] = mapped_column(Boolean, default=False)
    celery_task_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="schedules")
    channel: Mapped["Channel"] = relationship("Channel", back_populates="schedules")
    post: Mapped[Optional["Post"]] = relationship("Post")

    def __repr__(self):
        return f"<PostSchedule id={self.id} scheduled_at={self.scheduled_at}>"
