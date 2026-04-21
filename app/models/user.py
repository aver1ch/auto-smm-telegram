from sqlalchemy import BigInteger, String, Boolean, DateTime, Integer, Enum, Text, Float
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from app.core.database import Base
import enum
from datetime import datetime
from typing import Optional, List


class TariffType(str, enum.Enum):
    LITE = "lite"
    PRO = "pro"
    ENTERPRISE = "enterprise"


class UserStatus(str, enum.Enum):
    ACTIVE = "active"
    BLOCKED = "blocked"
    TRIAL = "trial"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    telegram_id: Mapped[int] = mapped_column(BigInteger, unique=True, nullable=False, index=True)
    username: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    first_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    last_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    language_code: Mapped[Optional[str]] = mapped_column(String(10), nullable=True, default="ru")

    tariff: Mapped[TariffType] = mapped_column(
        Enum(TariffType), default=TariffType.LITE, nullable=False
    )
    status: Mapped[UserStatus] = mapped_column(
        Enum(UserStatus), default=UserStatus.ACTIVE, nullable=False
    )
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Usage counters (reset daily)
    generations_today: Mapped[int] = mapped_column(Integer, default=0)
    posts_today: Mapped[int] = mapped_column(Integer, default=0)
    last_reset_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Token usage tracking
    total_tokens_used: Mapped[int] = mapped_column(BigInteger, default=0)
    total_cost_usd: Mapped[float] = mapped_column(Float, default=0.0)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    last_active_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    channels: Mapped[List["Channel"]] = relationship("Channel", back_populates="user", cascade="all, delete-orphan")
    posts: Mapped[List["Post"]] = relationship("Post", back_populates="user", cascade="all, delete-orphan")
    schedules: Mapped[List["PostSchedule"]] = relationship("PostSchedule", back_populates="user", cascade="all, delete-orphan")
    api_logs: Mapped[List["APILog"]] = relationship("APILog", back_populates="user", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<User id={self.id} telegram_id={self.telegram_id} tariff={self.tariff}>"
