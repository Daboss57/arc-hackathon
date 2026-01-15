import json
import os
import sys
from typing import Any, Dict

import httpx


def pretty(label: str, payload: Any) -> None:
    print(f"\n{label}")
    print(json.dumps(payload, indent=2))


def main() -> int:
    base_url = os.getenv("AI_SERVICE_URL", "http://localhost:3002").rstrip("/")
    user_id = os.getenv("TEST_USER_ID", "demo-user")

    with httpx.Client(timeout=30) as client:
        chat_resp = client.post(
            f"{base_url}/api/chats",
            json={"user_id": user_id, "title": "Demo Chat"},
        )
        if chat_resp.status_code >= 400:
            pretty("Create chat failed", chat_resp.json())
            return 1

        chat = chat_resp.json()
        chat_id = chat["id"]
        pretty("Chat created", chat)

        message_payload: Dict[str, Any] = {
            "content": "Check treasury balance and list vendors.",
            "respond": True,
            "include_thoughts": False,
            "use_tools": True,
        }
        message_resp = client.post(
            f"{base_url}/api/chats/{chat_id}/messages",
            json=message_payload,
        )
        if message_resp.status_code >= 400:
            pretty("Message failed", message_resp.json())
            return 1

        pretty("Message response", message_resp.json())

        history_resp = client.get(f"{base_url}/api/chats/{chat_id}/messages")
        if history_resp.status_code >= 400:
            pretty("History failed", history_resp.json())
            return 1

        pretty("Chat history", history_resp.json())

    return 0


if __name__ == "__main__":
    sys.exit(main())
