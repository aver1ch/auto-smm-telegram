import json
import logging
from typing import Dict, Optional, Any
from datetime import datetime
import redis.asyncio as redis
from app.core.config import settings

logger = logging.getLogger(__name__)


class StateType(str):
    IDLE = "idle"
    # Post creation states
    POST_CREATING = "post:creating"
    POST_TYPE_SELECTED = "post:type_selected"
    POST_TEXT_INPUT = "post:text_input"
    POST_TEXT_GENERATING = "post:text_generating"
    POST_PREVIEW = "post:preview"
    # Auto generation setup states
    AUTO_SETUP_TOPIC = "auto:setup:topic"
    AUTO_SETUP_STYLE = "auto:setup:style"
    AUTO_SETUP_FREQUENCY = "auto:setup:frequency"
    AUTO_SETUP_IMAGES = "auto:setup:images"
    AUTO_SETUP_MODEL = "auto:setup:model"
    AUTO_SETUP_CONFIRM = "auto:setup:confirm"
    # Settings states
    SETTINGS_TIME_MANUAL = "settings:time:manual"
    SETTINGS_DAYS_SELECT = "settings:days:select"
    # Approval states
    APPROVAL_PENDING = "approval:pending"


class UserStateManager:
    def __init__(self):
        self.redis = redis.from_url(settings.REDIS_URL, decode_responses=True)
        self.state_key_prefix = "user:state:"
        self.context_key_prefix = "user:context:"

    async def get_state(self, user_id: int) -> str:
        state = await self.redis.get(f"{self.state_key_prefix}{user_id}")
        return state or StateType.IDLE

    async def set_state(self, user_id: int, state: str) -> None:
        await self.redis.set(f"{self.state_key_prefix}{user_id}", state, ex=3600 * 24)

    async def get_context(self, user_id: int) -> Dict[str, Any]:
        data = await self.redis.get(f"{self.context_key_prefix}{user_id}")
        return json.loads(data) if data else {}

    async def update_context(self, user_id: int, **kwargs) -> None:
        context = await self.get_context(user_id)
        context.update(kwargs)
        await self.redis.set(f"{self.context_key_prefix}{user_id}", json.dumps(context), ex=3600 * 24)

    async def clear_context(self, user_id: int) -> None:
        await self.redis.delete(f"{self.context_key_prefix}{user_id}")

    async def reset(self, user_id: int) -> None:
        await self.set_state(user_id, StateType.IDLE)
        await self.clear_context(user_id)

    async def get_post_context(self, user_id: int) -> Dict[str, Any]:
        context = await self.get_context(user_id)
        return context.get("post", {})

    async def update_post_context(self, user_id: int, **kwargs) -> None:
        post_context = await self.get_post_context(user_id)
        post_context.update(kwargs)
        await self.update_context(user_id, post=post_context)

    async def get_auto_agent_config(self, user_id: int) -> Dict[str, Any]:
        context = await self.get_context(user_id)
        return context.get("auto_agent", {})

    async def update_auto_agent_config(self, user_id: int, **kwargs) -> None:
        agent_config = await self.get_auto_agent_config(user_id)
        agent_config.update(kwargs)
        await self.update_context(user_id, auto_agent=agent_config)

    async def close(self) -> None:
        await self.redis.close()


user_state_manager = UserStateManager()