"""Email sending — real SMTP when configured, demo outbox otherwise.

In demo mode (no SMTP host) emails are not actually transmitted; the caller is
expected to persist an `EmailLog` row so the send is auditable and testable.
"""

from __future__ import annotations

import smtplib
from dataclasses import dataclass
from email.message import EmailMessage as _PyEmailMessage

from app.config import settings


@dataclass
class EmailMessage:
    to: str
    subject: str
    body: str


def send_email(message: EmailMessage) -> dict:
    """Attempt to deliver an email.

    Returns ``{"delivered": bool, "provider": str, "error": str | None}``.
    Never raises — delivery failures are reported in the return value so the
    primary action (e.g. sharing a link) still succeeds.
    """
    if not settings.smtp_host:
        return {"delivered": True, "provider": "demo", "error": None}

    try:
        msg = _PyEmailMessage()
        msg["From"] = settings.email_from
        msg["To"] = message.to
        msg["Subject"] = message.subject
        msg.set_content(message.body)

        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as server:
            server.starttls()
            if settings.smtp_user:
                server.login(settings.smtp_user, settings.smtp_password)
            server.send_message(msg)
        return {"delivered": True, "provider": "smtp", "error": None}
    except Exception as exc:  # pragma: no cover - network dependent
        return {"delivered": False, "provider": "smtp", "error": str(exc)}
