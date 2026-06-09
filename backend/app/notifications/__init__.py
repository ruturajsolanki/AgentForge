"""Notifications + email side-effects for the delivery layer."""

from app.notifications.email import EmailMessage, send_email
from app.notifications.service import notify

__all__ = ["EmailMessage", "send_email", "notify"]
