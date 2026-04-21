from sqlalchemy import BigInteger, String, Boolean, DateTime, Integer, ForeignKey, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from app.core.database import Base
from datetime import datetime
from typing import Optional, List


class Channel(Base):
    __tablename__ = "channels"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    telegram_channel_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    channel_username: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    channel_title: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    channel_description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    bot_is_admin: Mapped[bool] = mapped_column(Boolean, default=False)

    # Subscriber count (updated periodically)
    subscribers_count: Mapped[int] = mapped_column(Integer, default=0)
    subscribers_updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Posting settings
    auto_post_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    posting_settings: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    # posting_settings structure:
    # {
    #   "schedule_type": "fixed|interval|window|adaptive",
    #   "times": ["09:00", "18:00"],
    #   "interval_hours": 6,
    #   "window_start": "18:00",
    #   "window_end": "22:00",
    #   "days_of_week": [0,1,2,3,4],  # 0=Mon, 6=Sun
    #   "timezone": "Europe/Moscow"
    # }

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="channels")
    posts: Mapped[List["Post"]] = relationship("Post", back_populates="channel", cascade="all, delete-orphan")
    schedules: Mapped[List["PostSchedule"]] = relationship("PostSchedule", back_populates="channel", cascade="all, delete-orphan")
    analytics: Mapped[List["ChannelAnalytics"]] = relationship("ChannelAnalytics", back_populates="channel", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Channel id={self.id} title={self.channel_title}>"
