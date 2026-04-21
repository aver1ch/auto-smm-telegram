from sqlalchemy import String, DateTime, Integer, ForeignKey, Text, JSON, Float, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from app.core.database import Base
from datetime import datetime
from typing import Optional


class APILog(Base):
    __tablename__ = "api_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)

    # Request info
    model: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    endpoint: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    action: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    # "generate_text", "generate_image", "analyze_comment", "analyze_post"

    # Token usage
    prompt_tokens: Mapped[int] = mapped_column(Integer, default=0)
    completion_tokens: Mapped[int] = mapped_column(Integer, default=0)
    total_tokens: Mapped[int] = mapped_column(Integer, default=0)
    cost_usd: Mapped[float] = mapped_column(Float, default=0.0)

    # Status
    success: Mapped[bool] = mapped_column(Boolean, default=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    response_time_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)

    # Relationships
    user: Mapped[Optional["User"]] = relationship("User", back_populates="api_logs")

    def __repr__(self):
        return f"<APILog id={self.id} action={self.action} tokens={self.total_tokens}>"
