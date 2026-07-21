import os
import httpx
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("Notifications")

async def dispatch_email_alert(to_email: str, subject: str, body: str) -> bool:
    """Dispatch email alert via logging (mocked for demo purposes)."""
    logger.info(f"[EMAIL SEND] To: {to_email} | Subject: {subject} | Body: {body}")
    return True


async def dispatch_sms_alert(phone_number: str, message: str) -> bool:
    """Dispatch SMS alert via Twilio/SMS Gateway interface."""
    logger.info(f"[SMS SEND] To: {phone_number} | Message: {message}")
    return True


async def dispatch_webhook_alert(webhook_url: str, payload: dict) -> bool:
    """Dispatch a structured webhook request to an external messaging hub (e.g., Teams/Slack)."""
    logger.info(f"[WEBHOOK SEND] To: {webhook_url} | Payload: {payload}")
    if not webhook_url:
        return False
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(webhook_url, json=payload)
            return resp.status_code in [200, 201, 204]
    except Exception as e:
        logger.error(f"Webhook dispatch failed: {e}")
        return False
