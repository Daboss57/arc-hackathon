"""
Unit tests for agent.py (supabase-backed version).

Focus on pure utility helpers to avoid external dependencies.
"""

from datetime import datetime

from agent import (
    build_contents,
    build_message,
    new_id,
    normalize_args,
    now_iso,
    schema_object,
)


def test_now_iso_returns_iso_string():
    result = now_iso()
    assert isinstance(result, str)
    parsed = datetime.fromisoformat(result)
    assert parsed.tzinfo is not None


def test_new_id_prefix_and_uniqueness():
    first = new_id("chat")
    second = new_id("chat")
    assert first.startswith("chat_")
    assert second.startswith("chat_")
    assert first != second


def test_normalize_args_variants():
    assert normalize_args(None) == {}
    assert normalize_args({"a": 1}) == {"a": 1}
    assert normalize_args('{"a": 1}') == {"a": 1}
    assert normalize_args("not json") == {"_raw": "not json"}


def test_schema_object_defaults():
    schema = schema_object({"name": {"type": "string"}})
    assert schema["type"] == "object"
    assert schema["properties"]["name"]["type"] == "string"
    assert schema["required"] == []


def test_build_message_fields():
    msg = build_message("user", "hello")
    assert msg["role"] == "user"
    assert msg["content"] == "hello"
    assert msg["id"].startswith("msg_")
    assert isinstance(msg["created_at"], str)


def test_build_contents_skips_system():
    messages = [
        build_message("system", "system prompt"),
        build_message("user", "hi"),
        build_message("assistant", "hello"),
    ]
    contents = build_contents(messages)
    assert len(contents) == 2
    assert contents[0].role == "user"
    assert contents[1].role == "model"
