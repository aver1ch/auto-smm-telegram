from sqlalchemy import String, Boolean, DateTime, Integer, ForeignKey, Text, JSON, Float, Enum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from app.core.database import Base
import enum
from datetime import datetime
from typing import Optional, List


class ABTestStatus(str, enum.Enum):
    RUNNING = "running"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class ABTest(Base):
    __tablename__ = "ab_tests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    channel_id: Mapped[int] = mapped_column(Integer, ForeignKey("channels.id", ondelete="CASCADE"), nullable=False)

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    status: Mapped[ABTestStatus] = mapped_column(Enum(ABTestStatus), default=ABTestStatus.RUNNING)

    # Test configuration
    test_variable: Mapped[str] = mapped_column(String(100), nullable=False)
    # "text_style", "posting_time", "content_length", "hashtags"

    # Results
    winner_group: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)  # "A" or "B"
    winner_metric: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    results_summary: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    # {
    #   "A": {"views": 100, "er": 0.05, "reactions": 5},
    #   "B": {"views": 150, "er": 0.08, "reactions": 12}
    # }

    auto_apply_winner: Mapped[bool] = mapped_column(Boolean, default=False)

    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    posts: Mapped[List["Post"]] = relationship("Post", back_populates="ab_test", foreign_keys="Post.ab_test_id")

    def __repr__(self):
        return f"<ABTest id={self.id} name={self.name} status={self.status}>"
