from aiogram.types import InlineKeyboardMarkup, InlineKeyboardButton
from typing import List, Optional, Dict, Any


# ============== MAIN MENU ==============

def main_menu_keyboard(is_admin: bool = False) -> InlineKeyboardMarkup:
    keyboard = [
        [InlineKeyboardButton("✍️ Создать пост", callback_data="post:create")],
        [InlineKeyboardButton("🤖 Автогенерация", callback_data="auto:setup")],
        [InlineKeyboardButton("📅 Календарь", callback_data="calendar:view")],
        [InlineKeyboardButton("📊 Аналитика", callback_data="analytics:view")],
        [InlineKeyboardButton("⚙️ Настройки", callback_data="settings:view")],
    ]

    if is_admin:
        keyboard.extend([
            [InlineKeyboardButton("👥 Пользователи", callback_data="admin:users")],
            [InlineKeyboardButton("📜 Логи", callback_data="admin:logs")],
            [InlineKeyboardButton("💳 Тарифы", callback_data="admin:tariffs")],
            [InlineKeyboardButton("🧠 Модели", callback_data="admin:models")],
        ])

    return InlineKeyboardMarkup(inline_keyboard=keyboard)


def back_button(callback_action: str = "menu:main") -> List[InlineKeyboardButton]:
    return [
        InlineKeyboardButton("◀️ Назад", callback_data=callback_action),
        InlineKeyboardButton("🏠 Главное меню", callback_data="menu:main"),
    ]


# ============== POST CREATION ==============

def post_type_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton("📝 Текст", callback_data="post:type:text")],
        [InlineKeyboardButton("🖼️ Текст + Изображение", callback_data="post:type:image")],
        *back_button("menu:main")
    ])


def post_actions_keyboard(post_id: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton("✅ Опубликовать сейчас", callback_data=f"post:publish:{post_id}")],
        [InlineKeyboardButton("⏰ Запланировать", callback_data=f"post:schedule:{post_id}")],
        [InlineKeyboardButton("📨 Отправить на аппрув", callback_data=f"post:approve:send:{post_id}")],
        [
            InlineKeyboardButton("✏️ Редактировать", callback_data=f"post:edit:{post_id}"),
            InlineKeyboardButton("❌ Отмена", callback_data="post:cancel")
        ],
        *back_button("menu:main")
    ])


# ============== AUTO GENERATION ==============

def content_style_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton("👨‍🔬 Экспертный", callback_data="auto:style:expert")],
        [InlineKeyboardButton("⚡ Провокационный", callback_data="auto:style:provocative")],
        [InlineKeyboardButton("🎭 Развлекательный", callback_data="auto:style:entertaining")],
        [InlineKeyboardButton("📚 Информационный", callback_data="auto:style:informational")],
        *back_button("menu:main")
    ])


def post_frequency_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton("📅 Раз в день", callback_data="auto:freq:once")],
        [InlineKeyboardButton("📅 x2 в день", callback_data="auto:freq:twice")],
        [InlineKeyboardButton("📅 x3 в день", callback_data="auto:freq:three")],
        [InlineKeyboardButton("⚙️ Настроить вручную", callback_data="auto:freq:custom")],
        *back_button("auto:setup:topic")
    ])


def auto_gen_confirm_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton("🚀 Запустить агента", callback_data="auto:agent:start")],
        [InlineKeyboardButton("👁️ Предпросмотр постов", callback_data="auto:preview")],
        [InlineKeyboardButton("❌ Отмена", callback_data="menu:main")],
        *back_button("auto:setup:frequency")
    ])


# ============== APPROVAL SYSTEM ==============

def approval_keyboard(post_id: int, user_id: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton("✅ Одобрить", callback_data=f"approve:accept:{post_id}:{user_id}"),
            InlineKeyboardButton("❌ Отклонить", callback_data=f"approve:reject:{post_id}:{user_id}")
        ],
        [InlineKeyboardButton("✏️ Отредактировать", callback_data=f"approve:edit:{post_id}:{user_id}")]
    ])


# ============== CALENDAR ==============

def calendar_navigation_keyboard(current_day: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton("◀️ Вчера", callback_data=f"calendar:day:{current_day}:prev"),
            InlineKeyboardButton("▶️ Завтра", callback_data=f"calendar:day:{current_day}:next")
        ],
        [
            InlineKeyboardButton("📅 Неделя", callback_data="calendar:week:view"),
            InlineKeyboardButton("📅 Месяц", callback_data="calendar:month:view")
        ],
        *back_button("menu:main")
    ])


def post_calendar_actions_keyboard(post_id: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [
            InlineKeyboardButton("✏️ Редактировать", callback_data=f"post:edit:{post_id}"),
            InlineKeyboardButton("🗑️ Удалить", callback_data=f"post:delete:{post_id}")
        ],
        [
            InlineKeyboardButton("🔄 Перенести", callback_data=f"post:reschedule:{post_id}"),
            InlineKeyboardButton("📨 На аппрув", callback_data=f"post:approve:send:{post_id}")
        ],
        *back_button("calendar:view")
    ])


# ============== ANALYTICS ==============

def analytics_period_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton("📅 Сегодня", callback_data="analytics:period:today")],
        [InlineKeyboardButton("📅 7 дней", callback_data="analytics:period:7days")],
        [InlineKeyboardButton("📅 30 дней", callback_data="analytics:period:30days")],
        *back_button("menu:main")
    ])


def analytics_actions_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton("📈 Подробнее", callback_data="analytics:details")],
        [InlineKeyboardButton("💡 Рекомендации", callback_data="analytics:recommendations")],
        *back_button("analytics:view")
    ])


# ============== SETTINGS ==============

def settings_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton("🧠 Выбор модели", callback_data="settings:model")],
        [InlineKeyboardButton("⏰ Время публикаций", callback_data="settings:posting_time")],
        [InlineKeyboardButton("🛡️ Фильтры комментариев", callback_data="settings:filters")],
        [InlineKeyboardButton("🤖 Автоответы", callback_data="settings:auto_replies")],
        *back_button("menu:main")
    ])


def posting_time_mode_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton("🤖 Авто (оптимальное время)", callback_data="settings:time:auto")],
        [InlineKeyboardButton("⚙️ Настроить вручную", callback_data="settings:time:manual")],
        *back_button("settings:view")
    ])


# ============== AGENT CONTROL ==============

def agent_control_keyboard(agent_running: bool = False) -> InlineKeyboardMarkup:
    if agent_running:
        return InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton("🛑 Остановить агента", callback_data="auto:agent:stop")],
            [InlineKeyboardButton("⚙️ Настройки агента", callback_data="auto:agent:settings")],
            *back_button("menu:main")
        ])
    else:
        return InlineKeyboardMarkup(inline_keyboard=[
            [InlineKeyboardButton("🚀 Запустить агента", callback_data="auto:agent:start")],
            *back_button("menu:main")
        ])


# ============== GENERATED POST ==============

def generated_post_actions_keyboard(post_id: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton("✅ Опубликовать", callback_data=f"gen:publish:{post_id}")],
        [InlineKeyboardButton("⏰ Отложить", callback_data=f"gen:postpone:{post_id}")],
        [
            InlineKeyboardButton("✏️ Редактировать", callback_data=f"gen:edit:{post_id}"),
            InlineKeyboardButton("❌ Отклонить", callback_data=f"gen:reject:{post_id}")
        ]
    ])