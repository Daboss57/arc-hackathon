"""
Unit tests for agent.py

Tests cover:
- Utility functions (now_iso, new_id, normalize_args, schema_object)
- Message building functions (append_message, build_contents)
- Tool handler functions (with mocked backend)
- API endpoint handlers (with TestClient)
"""

import asyncio
import json
from datetime import datetime, timezone
from typing import Any, Dict, List
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

# Import the module under test
from agent import (
    app,
    now_iso,
    new_id,
    normalize_args,
    schema_object,
    append_message,
    build_contents,
    backend_request,
    tool_get_treasury_balance,
    tool_get_treasury_history,
    tool_get_wallet,
    tool_get_spending_analytics,
    tool_list_policies,
    tool_create_policy,
    tool_update_policy,
    tool_delete_policy,
    tool_validate_payment,
    tool_execute_payment,
    tool_x402_fetch,
    tool_get_x402_status,
    tool_list_vendors,
    tool_search_products,
    tool_get_vendor,
    tool_list_vendor_products,
    tool_get_product,
    tool_purchase_product,
    tool_list_orders,
    CHATS,
    USER_CHATS,
    STORE_LOCK,
)


# ============================================================================
# Test Fixtures
# ============================================================================

@pytest.fixture
def client():
    """Create a test client for FastAPI app."""
    return TestClient(app)


@pytest.fixture
def sample_chat():
    """Create a sample chat for testing."""
    return {
        "id": "chat_abc123",
        "user_id": "test-user",
        "title": "Test Chat",
        "system_prompt": "You are a test assistant.",
        "model": "gemini-3-flash-preview",
        "created_at": "2026-01-15T00:00:00+00:00",
        "updated_at": "2026-01-15T00:00:00+00:00",
        "messages": [],
    }


@pytest.fixture
def sample_messages():
    """Create sample messages for testing."""
    return [
        {"id": "msg_1", "role": "user", "content": "Hello", "created_at": "2026-01-15T00:00:00+00:00"},
        {"id": "msg_2", "role": "assistant", "content": "Hi there!", "created_at": "2026-01-15T00:00:01+00:00"},
        {"id": "msg_3", "role": "system", "content": "Be helpful.", "created_at": "2026-01-15T00:00:02+00:00"},
    ]


@pytest.fixture(autouse=True)
def reset_store():
    """Reset the in-memory stores before each test."""
    CHATS.clear()
    USER_CHATS.clear()
    yield
    CHATS.clear()
    USER_CHATS.clear()


# ============================================================================
# Utility Function Tests
# ============================================================================

class TestNowIso:
    """Tests for now_iso() function."""

    def test_returns_string(self):
        """Should return an ISO format string."""
        result = now_iso()
        assert isinstance(result, str)

    def test_is_valid_iso_format(self):
        """Should return a valid ISO 8601 datetime string."""
        result = now_iso()
        # Should not raise an exception
        parsed = datetime.fromisoformat(result)
        assert parsed is not None

    def test_is_utc_timezone(self):
        """Should return a UTC timezone datetime."""
        result = now_iso()
        parsed = datetime.fromisoformat(result)
        assert parsed.tzinfo is not None


class TestNewId:
    """Tests for new_id() function."""

    def test_returns_string(self):
        """Should return a string."""
        result = new_id("test")
        assert isinstance(result, str)

    def test_starts_with_prefix(self):
        """Should start with the given prefix."""
        result = new_id("chat")
        assert result.startswith("chat_")

    def test_different_prefixes(self):
        """Should work with different prefixes."""
        chat_id = new_id("chat")
        msg_id = new_id("msg")
        assert chat_id.startswith("chat_")
        assert msg_id.startswith("msg_")

    def test_unique_ids(self):
        """Should generate unique IDs."""
        ids = [new_id("test") for _ in range(100)]
        assert len(set(ids)) == 100

    def test_contains_hex_suffix(self):
        """Should contain a hex UUID suffix."""
        result = new_id("test")
        suffix = result.replace("test_", "")
        # Hex string should be 32 chars
        assert len(suffix) == 32
        # Should be valid hex
        int(suffix, 16)


class TestNormalizeArgs:
    """Tests for normalize_args() function."""

    def test_none_returns_empty_dict(self):
        """Should return empty dict for None."""
        assert normalize_args(None) == {}

    def test_dict_returns_same_dict(self):
        """Should return the same dict for dict input."""
        input_dict = {"key": "value", "num": 42}
        result = normalize_args(input_dict)
        assert result == input_dict

    def test_valid_json_string(self):
        """Should parse valid JSON strings."""
        json_str = '{"name": "test", "value": 123}'
        result = normalize_args(json_str)
        assert result == {"name": "test", "value": 123}

    def test_invalid_json_string(self):
        """Should wrap invalid JSON strings in _raw key."""
        invalid_str = "not valid json"
        result = normalize_args(invalid_str)
        assert result == {"_raw": "not valid json"}

    def test_dict_like_object(self):
        """Should convert dict-like objects to dict."""
        class DictLike:
            def __iter__(self):
                return iter([("a", 1), ("b", 2)])
            def keys(self):
                return ["a", "b"]
            def __getitem__(self, key):
                return {"a": 1, "b": 2}[key]
        
        result = normalize_args(DictLike())
        assert result == {"a": 1, "b": 2}

    def test_non_convertible_object(self):
        """Should wrap non-convertible objects in _raw key."""
        result = normalize_args(12345)
        assert result == {"_raw": "12345"}


class TestSchemaObject:
    """Tests for schema_object() function."""

    def test_basic_schema(self):
        """Should create a basic object schema."""
        result = schema_object({"name": {"type": "string"}})
        assert result["type"] == "object"
        assert result["properties"] == {"name": {"type": "string"}}
        assert result["required"] == []

    def test_with_required_fields(self):
        """Should include required fields."""
        result = schema_object(
            {"name": {"type": "string"}, "age": {"type": "integer"}},
            required=["name"]
        )
        assert result["required"] == ["name"]

    def test_empty_properties(self):
        """Should work with empty properties."""
        result = schema_object({})
        assert result == {"type": "object", "properties": {}, "required": []}


# ============================================================================
# Message Function Tests
# ============================================================================

class TestAppendMessage:
    """Tests for append_message() function."""

    def test_appends_message_to_chat(self, sample_chat):
        """Should append a message to the chat."""
        result = append_message(sample_chat, "user", "Hello!")
        assert len(sample_chat["messages"]) == 1
        assert sample_chat["messages"][0] == result

    def test_message_has_correct_fields(self, sample_chat):
        """Should create message with correct fields."""
        result = append_message(sample_chat, "user", "Test content")
        assert result["role"] == "user"
        assert result["content"] == "Test content"
        assert "id" in result
        assert "created_at" in result
        assert result["id"].startswith("msg_")

    def test_includes_metadata(self, sample_chat):
        """Should include metadata when provided."""
        metadata = {"tool_calls": [{"name": "test"}]}
        result = append_message(sample_chat, "assistant", "Response", metadata)
        assert result["metadata"] == metadata

    def test_updates_chat_timestamp(self, sample_chat):
        """Should update chat's updated_at timestamp."""
        original_time = sample_chat["updated_at"]
        append_message(sample_chat, "user", "Hello!")
        assert sample_chat["updated_at"] != original_time


class TestBuildContents:
    """Tests for build_contents() function."""

    def test_converts_user_messages(self, sample_messages):
        """Should convert user messages to contents."""
        result = build_contents([sample_messages[0]])
        assert len(result) == 1
        assert result[0].role == "user"

    def test_converts_assistant_to_model(self, sample_messages):
        """Should convert assistant role to model."""
        result = build_contents([sample_messages[1]])
        assert len(result) == 1
        assert result[0].role == "model"

    def test_skips_system_messages(self, sample_messages):
        """Should skip system messages."""
        result = build_contents(sample_messages)
        # Only user and assistant, not system
        assert len(result) == 2

    def test_empty_messages(self):
        """Should handle empty messages list."""
        result = build_contents([])
        assert result == []

    def test_preserves_content(self, sample_messages):
        """Should preserve message content."""
        result = build_contents([sample_messages[0]])
        # Access the text from the first part
        assert result[0].parts[0].text == "Hello"


# ============================================================================
# Tool Handler Tests (with mocked backend)
# ============================================================================

class TestToolHandlers:
    """Tests for tool handler functions."""

    @pytest.fixture
    def mock_backend(self):
        """Mock the backend_request function."""
        with patch("agent.backend_request") as mock:
            mock.return_value = {"ok": True, "data": {"result": "success"}}
            yield mock

    @pytest.mark.asyncio
    async def test_get_treasury_balance(self, mock_backend):
        """Should call GET /api/treasury/balance."""
        mock_backend.return_value = {"ok": True, "data": {"balance": "100.00"}}
        result = await tool_get_treasury_balance({})
        mock_backend.assert_called_once_with("GET", "/api/treasury/balance")
        assert result["ok"] is True

    @pytest.mark.asyncio
    async def test_get_treasury_history_no_params(self, mock_backend):
        """Should call history endpoint without params."""
        await tool_get_treasury_history({})
        mock_backend.assert_called_once_with("GET", "/api/treasury/history", params={})

    @pytest.mark.asyncio
    async def test_get_treasury_history_with_params(self, mock_backend):
        """Should pass limit and offset params."""
        await tool_get_treasury_history({"limit": 10, "offset": 5})
        mock_backend.assert_called_once_with(
            "GET", "/api/treasury/history", params={"limit": 10, "offset": 5}
        )

    @pytest.mark.asyncio
    async def test_get_wallet(self, mock_backend):
        """Should call GET /api/treasury/wallet."""
        await tool_get_wallet({})
        mock_backend.assert_called_once_with("GET", "/api/treasury/wallet")

    @pytest.mark.asyncio
    async def test_get_spending_analytics(self, mock_backend):
        """Should call GET /api/treasury/analytics."""
        await tool_get_spending_analytics({})
        mock_backend.assert_called_once_with("GET", "/api/treasury/analytics")

    @pytest.mark.asyncio
    async def test_list_policies(self, mock_backend):
        """Should call GET /api/policy."""
        await tool_list_policies({})
        mock_backend.assert_called_once_with("GET", "/api/policy")

    @pytest.mark.asyncio
    async def test_create_policy_missing_fields(self, mock_backend):
        """Should return error for missing fields."""
        result = await tool_create_policy({})
        assert result["ok"] is False
        assert "required" in result["error"]

    @pytest.mark.asyncio
    async def test_create_policy_success(self, mock_backend):
        """Should create policy with valid data."""
        await tool_create_policy({
            "name": "Test Policy",
            "rules": [{"type": "max_amount", "value": 100}]
        })
        mock_backend.assert_called_once()
        call_args = mock_backend.call_args
        assert call_args[0][0] == "POST"
        assert call_args[0][1] == "/api/policy"

    @pytest.mark.asyncio
    async def test_update_policy_missing_id(self, mock_backend):
        """Should return error for missing policy_id."""
        result = await tool_update_policy({})
        assert result["ok"] is False
        assert "policy_id" in result["error"]

    @pytest.mark.asyncio
    async def test_update_policy_success(self, mock_backend):
        """Should update policy with valid data."""
        await tool_update_policy({
            "policy_id": "policy_123",
            "name": "Updated Policy"
        })
        mock_backend.assert_called_once()
        call_args = mock_backend.call_args
        assert "/api/policy/policy_123" in call_args[0][1]

    @pytest.mark.asyncio
    async def test_delete_policy_missing_id(self, mock_backend):
        """Should return error for missing policy_id."""
        result = await tool_delete_policy({})
        assert result["ok"] is False

    @pytest.mark.asyncio
    async def test_delete_policy_success(self, mock_backend):
        """Should delete policy."""
        await tool_delete_policy({"policy_id": "policy_123"})
        mock_backend.assert_called_once_with("DELETE", "/api/policy/policy_123")

    @pytest.mark.asyncio
    async def test_validate_payment_missing_fields(self, mock_backend):
        """Should return error for missing fields."""
        result = await tool_validate_payment({})
        assert result["ok"] is False

    @pytest.mark.asyncio
    async def test_validate_payment_success(self, mock_backend):
        """Should validate payment."""
        await tool_validate_payment({
            "amount": "10.00",
            "recipient": "0x123"
        })
        mock_backend.assert_called_once()

    @pytest.mark.asyncio
    async def test_execute_payment_missing_fields(self, mock_backend):
        """Should return error for missing fields."""
        result = await tool_execute_payment({})
        assert result["ok"] is False

    @pytest.mark.asyncio
    async def test_execute_payment_success(self, mock_backend):
        """Should execute payment."""
        await tool_execute_payment({
            "recipient": "0x123",
            "amount": "5.00"
        })
        mock_backend.assert_called_once()

    @pytest.mark.asyncio
    async def test_x402_fetch_missing_url(self, mock_backend):
        """Should return error for missing url."""
        result = await tool_x402_fetch({})
        assert result["ok"] is False

    @pytest.mark.asyncio
    async def test_x402_fetch_success(self, mock_backend):
        """Should fetch with x402."""
        await tool_x402_fetch({"url": "https://api.example.com"})
        mock_backend.assert_called_once()

    @pytest.mark.asyncio
    async def test_get_x402_status(self, mock_backend):
        """Should get x402 status."""
        await tool_get_x402_status({})
        mock_backend.assert_called_once_with("GET", "/api/payments/x402/status")

    @pytest.mark.asyncio
    async def test_list_vendors(self, mock_backend):
        """Should list vendors."""
        await tool_list_vendors({})
        mock_backend.assert_called_once_with("GET", "/api/vendors")

    @pytest.mark.asyncio
    async def test_search_products_missing_query(self, mock_backend):
        """Should return error for missing query."""
        result = await tool_search_products({})
        assert result["ok"] is False

    @pytest.mark.asyncio
    async def test_search_products_success(self, mock_backend):
        """Should search products."""
        await tool_search_products({"query": "laptop"})
        mock_backend.assert_called_once_with(
            "GET", "/api/vendors/search", params={"q": "laptop"}
        )

    @pytest.mark.asyncio
    async def test_get_vendor_missing_id(self, mock_backend):
        """Should return error for missing vendor_id."""
        result = await tool_get_vendor({})
        assert result["ok"] is False

    @pytest.mark.asyncio
    async def test_get_vendor_success(self, mock_backend):
        """Should get vendor."""
        await tool_get_vendor({"vendor_id": "v123"})
        mock_backend.assert_called_once_with("GET", "/api/vendors/v123")

    @pytest.mark.asyncio
    async def test_list_vendor_products_success(self, mock_backend):
        """Should list vendor products."""
        await tool_list_vendor_products({"vendor_id": "v123"})
        mock_backend.assert_called_once_with("GET", "/api/vendors/v123/products")

    @pytest.mark.asyncio
    async def test_get_product_missing_fields(self, mock_backend):
        """Should return error for missing fields."""
        result = await tool_get_product({"vendor_id": "v123"})
        assert result["ok"] is False

    @pytest.mark.asyncio
    async def test_get_product_success(self, mock_backend):
        """Should get product."""
        await tool_get_product({"vendor_id": "v123", "product_id": "p456"})
        mock_backend.assert_called_once_with("GET", "/api/vendors/v123/products/p456")

    @pytest.mark.asyncio
    async def test_purchase_product_success(self, mock_backend):
        """Should purchase product via x402."""
        await tool_purchase_product({"vendor_id": "v123", "product_id": "p456"})
        mock_backend.assert_called_once()
        call_args = mock_backend.call_args
        assert call_args[0][1] == "/api/payments/x402/fetch"

    @pytest.mark.asyncio
    async def test_list_orders(self, mock_backend):
        """Should list orders."""
        await tool_list_orders({})
        mock_backend.assert_called_once_with("GET", "/api/vendors/orders/all")


# ============================================================================
# API Endpoint Tests
# ============================================================================

class TestHealthEndpoint:
    """Tests for /health endpoint."""

    def test_health_check_returns_ok(self, client):
        """Should return ok status."""
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        assert "timestamp" in data


class TestChatEndpoints:
    """Tests for chat CRUD endpoints."""

    def test_create_chat(self, client):
        """Should create a new chat."""
        response = client.post(
            "/api/chats",
            json={"user_id": "test-user", "title": "My Chat"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["user_id"] == "test-user"
        assert data["title"] == "My Chat"
        assert data["id"].startswith("chat_")

    def test_create_chat_without_title(self, client):
        """Should create chat without title."""
        response = client.post(
            "/api/chats",
            json={"user_id": "test-user"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["title"] is None

    def test_create_chat_missing_user_id(self, client):
        """Should fail without user_id."""
        response = client.post("/api/chats", json={})
        assert response.status_code == 422  # Validation error

    def test_create_chat_empty_user_id(self, client):
        """Should fail with empty user_id."""
        response = client.post("/api/chats", json={"user_id": ""})
        assert response.status_code == 422

    def test_get_chat(self, client):
        """Should get an existing chat."""
        # Create first
        create_resp = client.post(
            "/api/chats",
            json={"user_id": "test-user"}
        )
        chat_id = create_resp.json()["id"]

        # Get it
        response = client.get(f"/api/chats/{chat_id}")
        assert response.status_code == 200
        assert response.json()["id"] == chat_id

    def test_get_chat_not_found(self, client):
        """Should return 404 for non-existent chat."""
        response = client.get("/api/chats/nonexistent_123")
        assert response.status_code == 404

    def test_list_user_chats(self, client):
        """Should list chats for a user."""
        # Create two chats
        client.post("/api/chats", json={"user_id": "user1", "title": "Chat 1"})
        client.post("/api/chats", json={"user_id": "user1", "title": "Chat 2"})
        client.post("/api/chats", json={"user_id": "user2", "title": "Other"})

        # List for user1
        response = client.get("/api/users/user1/chats")
        assert response.status_code == 200
        chats = response.json()
        assert len(chats) == 2

    def test_list_user_chats_empty(self, client):
        """Should return empty list for user with no chats."""
        response = client.get("/api/users/nobody/chats")
        assert response.status_code == 200
        assert response.json() == []


class TestMessageEndpoints:
    """Tests for message endpoints."""

    @pytest.fixture
    def chat_id(self, client):
        """Create a chat and return its ID."""
        response = client.post(
            "/api/chats",
            json={"user_id": "test-user"}
        )
        return response.json()["id"]

    def test_add_message_without_respond(self, client, chat_id):
        """Should add a message without generating response."""
        response = client.post(
            f"/api/chats/{chat_id}/messages",
            json={"content": "Hello!", "role": "user", "respond": False}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["message"]["content"] == "Hello!"
        assert data["assistant_message"] is None

    def test_add_assistant_message(self, client, chat_id):
        """Should add an assistant message."""
        response = client.post(
            f"/api/chats/{chat_id}/messages",
            json={"content": "I'm here to help!", "role": "assistant", "respond": False}
        )
        assert response.status_code == 200
        assert response.json()["message"]["role"] == "assistant"

    def test_add_message_to_nonexistent_chat(self, client):
        """Should return 404 for non-existent chat."""
        response = client.post(
            "/api/chats/fake_chat_123/messages",
            json={"content": "Hello!", "respond": False}
        )
        assert response.status_code == 404

    def test_add_empty_message(self, client, chat_id):
        """Should fail for empty message content."""
        response = client.post(
            f"/api/chats/{chat_id}/messages",
            json={"content": "", "respond": False}
        )
        assert response.status_code == 422

    def test_list_messages(self, client, chat_id):
        """Should list chat messages."""
        # Add some messages
        client.post(
            f"/api/chats/{chat_id}/messages",
            json={"content": "First", "respond": False}
        )
        client.post(
            f"/api/chats/{chat_id}/messages",
            json={"content": "Second", "respond": False}
        )

        response = client.get(f"/api/chats/{chat_id}/messages")
        assert response.status_code == 200
        data = response.json()
        assert data["chat_id"] == chat_id
        assert len(data["messages"]) == 2

    def test_list_messages_with_limit(self, client, chat_id):
        """Should respect limit parameter."""
        # Add 5 messages
        for i in range(5):
            client.post(
                f"/api/chats/{chat_id}/messages",
                json={"content": f"Message {i}", "respond": False}
            )

        response = client.get(f"/api/chats/{chat_id}/messages?limit=2")
        assert response.status_code == 200
        assert len(response.json()["messages"]) == 2

    def test_list_messages_nonexistent_chat(self, client):
        """Should return 404 for non-existent chat."""
        response = client.get("/api/chats/fake_123/messages")
        assert response.status_code == 404


# ============================================================================
# Backend Request Tests
# ============================================================================

class TestBackendRequest:
    """Tests for backend_request() function."""

    @pytest.mark.asyncio
    async def test_successful_request(self):
        """Should return ok response for successful request."""
        with patch("agent.HTTP_CLIENT.request") as mock_request:
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.json.return_value = {"data": "test"}
            mock_request.return_value = mock_response

            result = await backend_request("GET", "/api/test")
            assert result["ok"] is True
            assert result["data"] == {"data": "test"}

    @pytest.mark.asyncio
    async def test_error_response(self):
        """Should return error for 4xx/5xx responses."""
        with patch("agent.HTTP_CLIENT.request") as mock_request:
            mock_response = MagicMock()
            mock_response.status_code = 404
            mock_response.json.return_value = {"error": "Not found"}
            mock_request.return_value = mock_response

            result = await backend_request("GET", "/api/missing")
            assert result["ok"] is False
            assert result["status"] == 404

    @pytest.mark.asyncio
    async def test_request_exception(self):
        """Should handle request exceptions."""
        with patch("agent.HTTP_CLIENT.request") as mock_request:
            import httpx
            mock_request.side_effect = httpx.RequestError("Connection failed")

            result = await backend_request("GET", "/api/test")
            assert result["ok"] is False
            assert "Connection failed" in result["error"]

    @pytest.mark.asyncio
    async def test_json_decode_error(self):
        """Should handle non-JSON responses."""
        with patch("agent.HTTP_CLIENT.request") as mock_request:
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.json.side_effect = json.JSONDecodeError("fail", "", 0)
            mock_response.text = "plain text response"
            mock_request.return_value = mock_response

            result = await backend_request("GET", "/api/test")
            assert result["ok"] is True
            assert result["data"]["raw"] == "plain text response"


# ============================================================================
# Run tests
# ============================================================================

if __name__ == "__main__":
    pytest.main([__file__, "-v"])
