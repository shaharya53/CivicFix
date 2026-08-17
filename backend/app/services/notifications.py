import logging
from typing import Optional
from sqlalchemy.orm import Session
from app.models import Notification, User
from app.websocket import manager

logger = logging.getLogger(__name__)

async def notify_user(
    db: Session,
    user_id: int,
    noti_type: str,
    title: str,
    message: str,
    report_id: Optional[int] = None,
    task_id: Optional[int] = None,
    link: Optional[str] = None
):
    """
    Decoupled utility to persist a notification record to the database
    and broadcast it in real-time over active WebSockets.
    Isolates exceptions to protect calling database transaction commits.
    """
    try:
        # 1. Create and save database record (source of truth)
        db_noti = Notification(
            user_id=user_id,
            type=noti_type,
            title=title,
            message=message,
            report_id=report_id,
            task_id=task_id,
            link=link,
            read=False
        )
        db.add(db_noti)
        db.commit()
        db.refresh(db_noti)

        # 2. WebSocket transmission
        payload = {
            "event": "new_notification",
            "notification": {
                "id": db_noti.id,
                "type": noti_type,
                "title": title,
                "message": message,
                "report_id": report_id,
                "task_id": task_id,
                "link": link,
                "is_read": False,
                "created_at": db_noti.created_at.isoformat() if db_noti.created_at else None
            }
        }
        await manager.send_personal_message(payload, user_id)
        
    except Exception as e:
        logger.error(f"Failed to dispatch notification to user {user_id}: {str(e)}")
        # Rollback db session just in case of uncommitted states
        try:
            db.rollback()
        except Exception:
            pass

async def notify_admins(
    db: Session,
    noti_type: str,
    title: str,
    message: str,
    report_id: Optional[int] = None,
    task_id: Optional[int] = None,
    link: Optional[str] = None
):
    """
    Fetches all registered administrators and triggers notification dispatch for each.
    """
    try:
        admins = db.query(User).filter(User.role.in_(["ADMIN", "SUPER_ADMIN"])).all()
        for admin in admins:
            await notify_user(
                db=db,
                user_id=admin.id,
                noti_type=noti_type,
                title=title,
                message=message,
                report_id=report_id,
                task_id=task_id,
                link=link
            )
    except Exception as e:
        logger.error(f"Failed to fetch administrator directory for dispatch: {str(e)}")
