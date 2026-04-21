import logging
from aiogram import Router, types
from aiogram.types import CallbackQuery
from app.bot.keyboards.keyboards import (
    content_style_keyboard, post_frequency_keyboard,
    auto_gen_confirm_keyboard, agent_control_keyboard
)
from app.bot.states.state_manager import user_state_manager, StateType
from app.ai.content_generator import content_generator

logger = logging.getLogger(__name__)
router = Router()


@router.callback_query(lambda c: c.data == "auto:setup")
async def callback_auto_setup(callback: CallbackQuery) -> None:
    user_id = callback.from_user.id
    await user_state_manager.set_state(user_id, StateType.AUTO_SETUP_TOPIC)
    await user_state_manager.update_auto_agent_config(user_id, step=1)

    await callback.message.edit_text(
        """🤖 Настройка агента автогенерации

Шаг 1/5: Выберите тематику контента:""",
        reply_markup=types.InlineKeyboardMarkup(inline_keyboard=[
            [types.InlineKeyboardButton("💻 Технологии / AI", callback_data="auto:topic:tech")],
            [types.InlineKeyboardButton("📈 Бизнес / Маркетинг", callback_data="auto:topic:business")],
            [types.InlineKeyboardButton("🎭 Развлечения", callback_data="auto:topic:entertainment")],
            [types.InlineKeyboardButton("📚 Образование", callback_data="auto:topic:education")],
            [types.InlineKeyboardButton("✏️ Ввести свою тематику", callback_data="auto:topic:custom")],
            [types.InlineKeyboardButton("🏠 Главное меню", callback_data="menu:main")]
        ])
    )
    await callback.answer()


@router.callback_query(lambda c: c.data.startswith("auto:topic:"))
async def callback_auto_topic_selected(callback: CallbackQuery) -> None:
    user_id = callback.from_user.id
    topic = callback.data.split(":")[2]

    await user_state_manager.set_state(user_id, StateType.AUTO_SETUP_STYLE)
    await user_state_manager.update_auto_agent_config(user_id, topic=topic, step=2)

    await callback.message.edit_text(
        f"""🤖 Настройка агента автогенерации

Тематика: {topic}

Шаг 2/5: Выберите стиль контента:""",
        reply_markup=content_style_keyboard()
    )
    await callback.answer()


@router.callback_query(lambda c: c.data.startswith("auto:style:"))
async def callback_auto_style_selected(callback: CallbackQuery) -> None:
    user_id = callback.from_user.id
    style = callback.data.split(":")[2]

    await user_state_manager.set_state(user_id, StateType.AUTO_SETUP_FREQUENCY)
    await user_state_manager.update_auto_agent_config(user_id, style=style, step=3)

    await callback.message.edit_text(
        f"""🤖 Настройка агента автогенерации

Тематика: {style}
Стиль: {style}

Шаг 3/5: Частота публикаций:""",
        reply_markup=post_frequency_keyboard()
    )
    await callback.answer()


@router.callback_query(lambda c: c.data.startswith("auto:freq:"))
async def callback_auto_frequency_selected(callback: CallbackQuery) -> None:
    user_id = callback.from_user.id
    freq = callback.data.split(":")[2]

    await user_state_manager.set_state(user_id, StateType.AUTO_SETUP_CONFIRM)
    await user_state_manager.update_auto_agent_config(user_id, frequency=freq, step=4)
    agent_config = await user_state_manager.get_auto_agent_config(user_id)

    config_summary = f"""🤖 Настройка агента автогенерации

✅ Конфигурация завершена:

📌 Тематика: {agent_config.get('topic', 'не выбрано')}
🎭 Стиль: {agent_config.get('style', 'не выбрано')}
⏰ Частота: {freq} раз в день
🖼️ Изображения: включены
🧠 Модель: стандартная

Подтвердите настройки:"""

    await callback.message.edit_text(
        config_summary,
        reply_markup=auto_gen_confirm_keyboard()
    )
    await callback.answer()


@router.callback_query(lambda c: c.data == "auto:agent:start")
async def callback_auto_agent_start(callback: CallbackQuery) -> None:
    user_id = callback.from_user.id

    await callback.message.edit_text(
        """🚀 Агент автогенерации запущен!

Теперь бот будет автоматически генерировать и публиковать посты по вашему расписанию.

Статус: ✅ Активен""",
        reply_markup=agent_control_keyboard(agent_running=True)
    )
    await callback.answer("Агент запущен!")


@router.callback_query(lambda c: c.data == "auto:agent:stop")
async def callback_auto_agent_stop(callback: CallbackQuery) -> None:
    user_id = callback.from_user.id

    await callback.message.edit_text(
        """🛑 Агент автогенерации остановлен.

Автоматическая публикация отключена.

Статус: ⏹️ Остановлен""",
        reply_markup=agent_control_keyboard(agent_running=False)
    )
    await callback.answer("Агент остановлен")