from typing import Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.database import get_db
from app import auth
from app.models import User, Notification

router = APIRouter(prefix="/notifications", tags=["Notifications"])

@router.get("")
def list_my_notifications(
    unread_only: bool = Query(False),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_user)
):
    """
    Returns the current user's paginated notification logs list,
    optionally filtered by unread state.
    """
    query = db.query(Notification).filter(Notification.user_id == current_user.id)

    if unread_only:
        query = query.filter(Notification.read == False)

    query = query.order_by(desc(Notification.created_at))

    total = query.count()
    offset = (page - 1) * limit
    results = query.offset(offset).limit(limit).all()

    # Formulate payload. Since Notification table has read/created_at, we expose them.
    # Note: frontend expects type, report_id, link, is_read, so we provide default values or map links.
    notifications_list = []
    for n in results:
        # Determine deep-link metadata dynamically or parse if stored
        link = None
        noti_type = "SYSTEM"
        report_id = None
        
        # Simple heuristics based on message contents
        if "assigned" in n.message.lower() or "worker" in n.message.lower():
            noti_type = "REPORT_ASSIGNED"
            link = f"/worker/tasks"
        elif "status" in n.message.lower() or "resolved" in n.message.lower():
            noti_type = "REPORT_STATUS_CHANGED"
            link = f"/dashboard"
        elif "submitted" in n.message.lower() or "new report" in n.message.lower():
            noti_type = "REPORT_CREATED"
            link = f"/admin/dashboard"

        notifications_list.append({
            "id": n.id,
            "type": noti_type,
            "title": n.title,
            "message": n.message,
            "is_read": n.read,
            "link": link,
            "report_id": report_id,
            "created_at": n.created_at.isoformat() if n.created_at else None
        })

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "notifications": notifications_list
    }

@router.get("/unread-count")
def get_unread_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_user)
):
    """Returns the unread notifications count for the authenticated user."""
    count = db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.read == False
    ).count()
    return {"unread_count": count}

@router.put("/{id}/read")
def mark_notification_as_read(
    id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_user)
):
    """Marks a specific notification as read, enforcing user ownership gating."""
    notification = db.query(Notification).filter(Notification.id == id).first()
    if not notification:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")

    if notification.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: You do not own this notification."
        )

    notification.read = True
    db.commit()
    return {"message": "Notification marked as read"}

@router.put("/read-all")
def mark_all_as_read(
    db: Session = Depends(get_db),
    current_user: User = Depends(auth.get_current_user)
):
    """Marks all unread notifications of the current user as read."""
    unread_notifications = db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.read == False
    ).all()

    for n in unread_notifications:
        n.read = True
    
    db.commit()
    return {"message": "All notifications marked as read"}
