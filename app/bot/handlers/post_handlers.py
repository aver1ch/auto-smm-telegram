import logging
from aiogram import Router, types
from aiogram.types import CallbackQuery
from app.bot.keyboards.keyboards import (
    post_type_keyboard, post_actions_keyboard, back_button
)
from app.bot.states.state_manager import user_state_manager, StateType
from app.ai.content_generator import content_generator

logger = logging.getLogger(__name__)
router = Router()


@router.callback_query(lambda c: c.data == "post:create")
async def callback_post_create(callback: CallbackQuery) -> None:
    user_id = callback.from_user.id
    await user_state_manager.set_state(user_id, StateType.POST_CREATING)
    await user_state_manager.update_post_context(user_id, step=1)

    await callback.message.edit_text(
        "✍️ Создание поста\n\nВыберите тип контента:",
        reply_markup=post_type_keyboard()
    )
    await callback.answer()


@router.callback_query(lambda c: c.data.startswith("post:type:"))
async def callback_post_type_selected(callback: CallbackQuery) -> None:
    user_id = callback.from_user.id
    post_type = callback.data.split(":")[2]

    await user_state_manager.set_state(user_id, StateType.POST_TYPE_SELECTED)
    await user_state_manager.update_post_context(user_id, type=post_type, step=2)

    await callback.message.edit_text(
        f"""✍️ Создание поста
Тип: {post_type}

✅ Введите текст поста или нажмите кнопку "Сгенерировать":""",
        reply_markup=types.InlineKeyboardMarkup(inline_keyboard=[
            [types.InlineKeyboardButton("🤖 Сгенерировать текст", callback_data="post:generate:text")],
            *back_button("post:create")
        ])
    )
    await callback.answer()


@router.callback_query(lambda c: c.data == "post:generate:text")
async def callback_post_generate_text(callback: CallbackQuery) -> None:
    user_id = callback.from_user.id
    await user_state_manager.set_state(user_id, StateType.POST_TEXT_GENERATING)

    await callback.message.edit_text(
        "🔄 Генерация текста...\n\nПожалуйста подождите, AI создаёт контент для вас."
    )

    try:
        # Demo generation with default params
        result = await content_generator.generate_post(
            topic="технологии и искусственный интеллект",
            tariff="pro",
            use_powerful_model=False
        )

        post_text = result["content"]
        await user_state_manager.update_post_context(
            user_id,
            text=post_text,
            model=result["model"],
            tokens=result["total_tokens"],
            step=3
        )
        await user_state_manager.set_state(user_id, StateType.POST_PREVIEW)

        preview_text = f"""👁️ Предпросмотр поста:

{post_text}

----------------------------------------
✅ Пост готов. Выберите действие:"""

        await callback.message.edit_text(
            preview_text,
            reply_markup=post_actions_keyboard(0)  # Demo post_id = 0
        )

    except Exception as e:
        logger.error(f"Error generating post: {e}")
        await callback.message.edit_text(
            "❌ Ошибка генерации поста. Попробуйте позже.",
            reply_markup=types.InlineKeyboardMarkup(inline_keyboard=[
                *back_button("post:create")
            ])
        )

    await callback.answer()


@router.callback_query(lambda c: c.data.startswith("post:publish:"))
async def callback_post_publish(callback: CallbackQuery) -> None:
    post_id = int(callback.data.split(":")[2])

    await callback.message.edit_text(
        "✅ Пост успешно опубликован!",
        reply_markup=types.InlineKeyboardMarkup(inline_keyboard=[
            [types.InlineKeyboardButton("🏠 Главное меню", callback_data="menu:main")]
        ])
    )
    await callback.answer("Пост опубликован")


@router.callback_query(lambda c: c.data.startswith("post:approve:send:"))
async def callback_post_send_for_approval(callback: CallbackQuery) -> None:
    post_id = int(callback.data.split(":")[3])
    user_id = callback.from_user.id

    await callback.message.edit_text(
        "✅ Пост отправлен на модерацию. Администратор получит уведомление.",
        reply_markup=types.InlineKeyboardMarkup(inline_keyboard=[
            [types.InlineKeyboardButton("🏠 Главное меню", callback_data="menu:main")]
        ])
    )
    await callback.answer("Пост отправлен на аппрув")