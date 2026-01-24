import asyncio
import json
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional, Tuple

import dotenv
import httpx
import google.genai as genai
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from google.genai import types
from starlette.concurrency import iterate_in_threadpool
from contextlib import asynccontextmanager

try:
    from postgrest.exceptions import APIError
except Exception:  # pragma: no cover - optional dependency
    APIError = Exception

dotenv.load_dotenv(dotenv.find_dotenv())

API_KEY = os.getenv("GOOGLE_AI_API_KEY")
if not API_KEY:
    API_KEY = dotenv.get_key(dotenv.find_dotenv(), "GOOGLE_AI_API_KEY")

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:3001").rstrip("/")

SUPABASE_URL = os.getenv("SUPABASE_URL")
if not SUPABASE_URL:
    SUPABASE_URL = dotenv.get_key(dotenv.find_dotenv(), "SUPABASE_URL")

SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
if not SUPABASE_SERVICE_ROLE_KEY:
    SUPABASE_SERVICE_ROLE_KEY = dotenv.get_key(dotenv.find_dotenv(), "SUPABASE_SERVICE_ROLE_KEY")
SUPABASE_ENABLED = False
SUPABASE_CLIENT = None

try:
    from supabase import create_client
except Exception:  # pragma: no cover - optional dependency
    create_client = None

if SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY and create_client:
    SUPABASE_CLIENT = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    SUPABASE_ENABLED = True

AgentClient = genai.Client(api_key=API_KEY) if API_KEY else None

DEFAULT_MODEL = os.getenv("GEMINI_MODEL", "gemini-3-pro-preview")
DEFAULT_SYSTEM_PROMPT = (
    "You are an AI financial assistant for AutoWealth that helps users manage their "
    "treasury and make purchases. You have access to tools for checking balances, "
    "viewing transaction history, browsing vendors, and making purchases.\n\n"
    "IMPORTANT RULES:\n"
    "1. ALWAYS use tools to get real-time data. NEVER rely on previous conversation "
    "context for values like balances, prices, or transaction status.\n"
    "2. When asked about balance, ALWAYS call get_treasury_balance - never quote old values.\n"
    "3. When making purchases, first check the balance, then execute the purchase.\n"
    "4. Never create or update spending policies without explicit user approval.\n"
    "5. Be concise but informative in your responses.\n"
    "6. If a tool call fails, explain the error to the user.\n"
    "7. For x402 micropayment demos, ALWAYS use this URL: http://localhost:3001/api/payments/x402/demo/paid-content\n"
    "   DO NOT use api.demo.com or any other placeholder URLs - they don't exist."
)

MAX_TOOL_STEPS = int(os.getenv("MAX_TOOL_STEPS", "12"))  # Increased to allow search + purchase
HTTP_TIMEOUT = float(os.getenv("BACKEND_TIMEOUT", "60"))

HTTP_CLIENT = httpx.AsyncClient(timeout=HTTP_TIMEOUT)

grounding_tool = types.Tool(google_search=types.GoogleSearch())


def schema_object(properties: Dict[str, Any], required: Optional[List[str]] = None) -> Dict[str, Any]:
    return {
        "type": "object",
        "properties": properties,
        "required": required or [],
    }


function_tool = types.Tool(
    function_declarations=[
        types.FunctionDeclaration(
            name="get_treasury_balance",
            description="Get the current USDC treasury balance.",
            parameters=schema_object({}),
        ),
        types.FunctionDeclaration(
            name="get_treasury_history",
            description="Get USDC transaction history from the treasury.",
            parameters=schema_object(
                {
                    "limit": {"type": "integer", "description": "Max transactions to return."},
                    "offset": {"type": "integer", "description": "Pagination offset."},
                }
            ),
        ),
        types.FunctionDeclaration(
            name="get_wallet",
            description="Get the current Circle wallet details.",
            parameters=schema_object({}),
        ),
        types.FunctionDeclaration(
            name="get_spending_analytics",
            description="Get spending analytics for the treasury wallet.",
            parameters=schema_object({}),
        ),
        types.FunctionDeclaration(
            name="list_policies",
            description="List active spending policies.",
            parameters=schema_object({}),
        ),
        types.FunctionDeclaration(
            name="create_policy",
            description=(
                "Create a new spending policy with rules. "
                "Valid rule types are: "
                "'maxPerTransaction' (params: {max: number}), "
                "'dailyLimit' (params: {limit: number}), "
                "'monthlyBudget' (params: {budget: number}), "
                "'vendorWhitelist' (params: {addresses: string[]}), "
                "'categoryLimit' (params: {limits: {category: number}}). "
                "Each rule must have 'type' and 'params' fields."
            ),
            parameters=schema_object(
                {
                    "name": {"type": "string", "description": "Name of the policy"},
                    "description": {"type": "string", "description": "Description of what the policy does"},
                    "rules": {
                        "type": "array",
                        "description": "Array of rule objects. Each rule must have 'type' (string) and 'params' (object) fields.",
                        "items": {
                            "type": "object",
                            "properties": {
                                "type": {"type": "string", "description": "One of: maxPerTransaction, dailyLimit, monthlyBudget, vendorWhitelist, categoryLimit"},
                                "params": {"type": "object", "description": "Parameters for the rule (e.g., {max: 0.15} for maxPerTransaction)"}
                            }
                        },
                    },
                },
                required=["name", "rules"],
            ),
        ),
        types.FunctionDeclaration(
            name="create_spending_policy",
            description=(
                "Alias of create_policy. Create a new spending policy with rules. "
                "Valid rule types are: maxPerTransaction, dailyLimit, monthlyBudget, vendorWhitelist, categoryLimit."
            ),
            parameters=schema_object(
                {
                    "name": {"type": "string"},
                    "description": {"type": "string"},
                    "rules": {
                        "type": "array",
                        "items": {"type": "object"},
                    },
                },
                required=["name", "rules"],
            ),
        ),
        types.FunctionDeclaration(
            name="update_policy",
            description="Update an existing spending policy.",
            parameters=schema_object(
                {
                    "policy_id": {"type": "string"},
                    "name": {"type": "string"},
                    "description": {"type": "string"},
                    "enabled": {"type": "boolean"},
                    "rules": {
                        "type": "array",
                        "items": {"type": "object"},
                    },
                },
                required=["policy_id"],
            ),
        ),
        types.FunctionDeclaration(
            name="update_spending_policy",
            description="Alias of update_policy. Update an existing spending policy.",
            parameters=schema_object(
                {
                    "policy_id": {"type": "string"},
                    "name": {"type": "string"},
                    "description": {"type": "string"},
                    "enabled": {"type": "boolean"},
                    "rules": {
                        "type": "array",
                        "items": {"type": "object"},
                    },
                },
                required=["policy_id"],
            ),
        ),
        types.FunctionDeclaration(
            name="delete_policy",
            description="Delete a spending policy.",
            parameters=schema_object(
                {"policy_id": {"type": "string"}},
                required=["policy_id"],
            ),
        ),
        types.FunctionDeclaration(
            name="delete_spending_policy",
            description="Alias of delete_policy. Delete a spending policy.",
            parameters=schema_object(
                {"policy_id": {"type": "string"}},
                required=["policy_id"],
            ),
        ),
        types.FunctionDeclaration(
            name="validate_payment",
            description="Validate a payment against policies.",
            parameters=schema_object(
                {
                    "amount": {"type": "string", "description": "USDC amount like '5.00'."},
                    "recipient": {"type": "string"},
                    "category": {"type": "string"},
                    "description": {"type": "string"},
                },
                required=["amount", "recipient"],
            ),
        ),
        types.FunctionDeclaration(
            name="execute_payment",
            description="Execute a payment from the treasury wallet.",
            parameters=schema_object(
                {
                    "recipient": {"type": "string"},
                    "amount": {"type": "string"},
                    "category": {"type": "string"},
                    "description": {"type": "string"},
                    "metadata": {"type": "object"},
                },
                required=["recipient", "amount"],
            ),
        ),
        types.FunctionDeclaration(
            name="x402_fetch",
            description=(
                "Call a paid API using x402 micropayments. "
                "For demos, use http://localhost:3001/api/payments/x402/demo/paid-content - "
                "this is the only working x402 endpoint. Do NOT use placeholder URLs like api.demo.com."
            ),
            parameters=schema_object(
                {
                    "url": {"type": "string", "description": "The x402 API URL. For demos use: http://localhost:3001/api/payments/x402/demo/paid-content"},
                    "method": {"type": "string"},
                    "body": {"type": "object"},
                    "headers": {"type": "object"},
                    "category": {"type": "string"},
                },
                required=["url"],
            ),
        ),
        types.FunctionDeclaration(
            name="get_x402_status",
            description="Check if x402 payments are enabled.",
            parameters=schema_object({}),
        ),
        types.FunctionDeclaration(
            name="list_vendors",
            description="List available vendors in the marketplace.",
            parameters=schema_object({}),
        ),
        types.FunctionDeclaration(
            name="search_products",
            description="Search products across all vendors.",
            parameters=schema_object(
                {"query": {"type": "string"}},
                required=["query"],
            ),
        ),
        types.FunctionDeclaration(
            name="get_vendor",
            description="Get a vendor's details by ID.",
            parameters=schema_object(
                {"vendor_id": {"type": "string"}},
                required=["vendor_id"],
            ),
        ),
        types.FunctionDeclaration(
            name="list_vendor_products",
            description="List products for a vendor.",
            parameters=schema_object(
                {"vendor_id": {"type": "string"}},
                required=["vendor_id"],
            ),
        ),
        types.FunctionDeclaration(
            name="get_product",
            description="Get details for a specific product.",
            parameters=schema_object(
                {"vendor_id": {"type": "string"}, "product_id": {"type": "string"}},
                required=["vendor_id", "product_id"],
            ),
        ),
        types.FunctionDeclaration(
            name="purchase_product",
            description="Purchase a product using x402 micropayments.",
            parameters=schema_object(
                {
                    "vendor_id": {"type": "string"},
                    "product_id": {"type": "string"},
                    "category": {"type": "string"},
                },
                required=["vendor_id", "product_id"],
            ),
        ),
        types.FunctionDeclaration(
            name="list_orders",
            description="List all vendor orders (demo only).",
            parameters=schema_object({}),
        ),
    ]
)

@asynccontextmanager
async def lifespan(_: FastAPI):
    # Try to verify Supabase connection but DONT crash if it fails
    # This ensures the /health endpoint still works so we can debug
    try:
        if SUPABASE_ENABLED and SUPABASE_CLIENT:
            await supabase_exec(lambda: SUPABASE_CLIENT.table("chats").select("count", count="exact").limit(1).execute())
    except Exception as e:
        print(f"Startup Warning: Supabase check failed: {e}")
        # do not raise, let app start
    
    yield
    await HTTP_CLIENT.aclose()


app = FastAPI(title="AutoWealth AI Service", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:4173",
        "https://arc-hackathon-frontend.vercel.app",
        "https://arc-hackathon-frontend-git-main-daboss57s-projects.vercel.app"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check():
    return {
        "status": "ok",
        "timestamp": now_iso(),
        "supabase": "connected" if SUPABASE_CLIENT else "disconnected",
        "models": DEFAULT_MODEL
    }



class ChatCreateRequest(BaseModel):
    user_id: str = Field(..., min_length=1)
    title: Optional[str] = None
    system_prompt: Optional[str] = None
    model: Optional[str] = None


class ChatResponse(BaseModel):
    id: str
    user_id: str
    title: Optional[str]
    system_prompt: str
    model: str
    created_at: str
    updated_at: str


class ChatUpdateRequest(BaseModel):
    title: Optional[str] = None


class MessageCreateRequest(BaseModel):
    content: str = Field(..., min_length=1)
    role: Literal["user", "assistant", "system"] = "user"
    respond: bool = True
    model: Optional[str] = None
    include_thoughts: bool = True
    use_tools: bool = True
    use_search: bool = False


class MessageResponse(BaseModel):
    id: str
    role: str
    content: str
    created_at: str
    metadata: Optional[Dict[str, Any]] = None


class ChatMessagesResponse(BaseModel):
    chat_id: str
    messages: List[MessageResponse]


class ChatMessageCreateResponse(BaseModel):
    chat_id: str
    message: MessageResponse
    assistant_message: Optional[MessageResponse] = None


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex}"


def build_message(
    role: str,
    content: str,
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    return {
        "id": new_id("msg"),
        "role": role,
        "content": content,
        "created_at": now_iso(),
        "metadata": metadata,
    }


def build_contents(messages: List[Dict[str, Any]]) -> List[types.Content]:
    contents: List[types.Content] = []
    for message in messages:
        role = message["role"]
        if role == "system":
            continue
        model_role = "user" if role == "user" else "model"
        contents.append(
            types.Content(
                role=model_role,
                parts=[types.Part(text=message["content"])],
            )
        )
    return contents


def normalize_args(raw_args: Any) -> Dict[str, Any]:
    if raw_args is None:
        return {}
    if isinstance(raw_args, dict):
        return raw_args
    if isinstance(raw_args, str):
        try:
            return json.loads(raw_args)
        except json.JSONDecodeError:
            return {"_raw": raw_args}
    try:
        return dict(raw_args)
    except TypeError:
        return {"_raw": str(raw_args)}


async def supabase_exec(action):
    if not SUPABASE_ENABLED or not SUPABASE_CLIENT:
        raise HTTPException(
            status_code=500,
            detail="Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
        )

    def _run():
        return action()

    try:
        response = await asyncio.to_thread(_run)
    except APIError as exc:  # pragma: no cover - Supabase API error
        raise HTTPException(status_code=500, detail=f"Supabase error: {exc}") from exc
    except Exception as exc:  # pragma: no cover - network or schema errors
        raise HTTPException(status_code=500, detail=f"Supabase request failed: {exc}") from exc

    data = getattr(response, "data", None)
    error = getattr(response, "error", None)
    status = getattr(response, "status_code", None)

    if error:
        raise HTTPException(status_code=500, detail=f"Supabase error: {error}")
    if status and status >= 400:
        raise HTTPException(status_code=500, detail=f"Supabase request failed (status {status}).")

    return data


def normalize_chat_row(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": row["id"],
        "user_id": row["user_id"],
        "title": row.get("title"),
        "system_prompt": row.get("system_prompt") or DEFAULT_SYSTEM_PROMPT,
        "model": row.get("model") or DEFAULT_MODEL,
        "created_at": row.get("created_at") or now_iso(),
        "updated_at": row.get("updated_at") or now_iso(),
    }


async def db_create_chat(chat: Dict[str, Any]) -> Dict[str, Any]:
    row = normalize_chat_row(chat)
    await supabase_exec(lambda: SUPABASE_CLIENT.table("chats").insert(row).execute())
    return row


async def db_list_chats(user_id: str) -> List[Dict[str, Any]]:
    data = await supabase_exec(
        lambda: SUPABASE_CLIENT.table("chats")
        .select("*")
        .eq("user_id", user_id)
        .order("updated_at", desc=True)
        .execute()
    )
    if not data:
        return []
    return [normalize_chat_row(row) for row in data]


async def db_get_chat(chat_id: str) -> Optional[Dict[str, Any]]:
    data = await supabase_exec(
        lambda: SUPABASE_CLIENT.table("chats")
        .select("*")
        .eq("id", chat_id)
        .limit(1)
        .execute()
    )
    if not data:
        return None
    return normalize_chat_row(data[0])


async def db_list_messages(chat_id: str, limit: Optional[int] = None) -> List[Dict[str, Any]]:
    if limit:
        query = (
            SUPABASE_CLIENT.table("chat_messages")
            .select("*")
            .eq("chat_id", chat_id)
            .order("created_at", desc=True)
            .limit(limit)
        )
    else:
        query = SUPABASE_CLIENT.table("chat_messages").select("*").eq("chat_id", chat_id).order("created_at", desc=False)
    data = await supabase_exec(lambda: query.execute())
    if not data:
        return []
    rows = [
        {
            "id": row["id"],
            "role": row["role"],
            "content": row["content"],
            "created_at": row.get("created_at") or now_iso(),
            "metadata": row.get("metadata"),
        }
        for row in data
    ]
    if limit:
        rows.reverse()
    return rows


async def db_list_messages_first(chat_id: str, limit: int = 2) -> List[Dict[str, Any]]:
    query = (
        SUPABASE_CLIENT.table("chat_messages")
        .select("*")
        .eq("chat_id", chat_id)
        .order("created_at", desc=False)
        .limit(limit)
    )
    data = await supabase_exec(lambda: query.execute())
    if not data:
        return []
    return [
        {
            "id": row["id"],
            "role": row["role"],
            "content": row["content"],
            "created_at": row.get("created_at") or now_iso(),
            "metadata": row.get("metadata"),
        }
        for row in data
    ]


async def db_get_first_user_message(chat_id: str) -> str:
    query = (
        SUPABASE_CLIENT.table("chat_messages")
        .select("content, role")
        .eq("chat_id", chat_id)
        .eq("role", "user")
        .order("created_at", desc=False)
        .limit(1)
    )
    data = await supabase_exec(lambda: query.execute())
    if not data:
        return ""
    return str(data[0].get("content") or "").strip()


async def db_insert_message(chat_id: str, user_id: str, message: Dict[str, Any]) -> Dict[str, Any]:
    row = {
        "id": message["id"],
        "chat_id": chat_id,
        "user_id": user_id,
        "role": message["role"],
        "content": message["content"],
        "metadata": message.get("metadata"),
        "created_at": message["created_at"],
    }
    await supabase_exec(lambda: SUPABASE_CLIENT.table("chat_messages").insert(row).execute())
    return message


async def db_update_chat(chat_id: str, fields: Dict[str, Any]) -> None:
    await supabase_exec(lambda: SUPABASE_CLIENT.table("chats").update(fields).eq("id", chat_id).execute())


async def db_delete_chat(chat_id: str) -> None:
    await supabase_exec(lambda: SUPABASE_CLIENT.table("chat_messages").delete().eq("chat_id", chat_id).execute())
    await supabase_exec(lambda: SUPABASE_CLIENT.table("chats").delete().eq("id", chat_id).execute())


async def backend_request(
    method: str,
    path: str,
    params: Optional[Dict[str, Any]] = None,
    json_body: Optional[Dict[str, Any]] = None,
    headers: Optional[Dict[str, str]] = None,
    user_id: Optional[str] = None,
) -> Dict[str, Any]:
    url = f"{BACKEND_URL}{path}"
    try:
        request_headers = headers or {}
        if user_id and "x-user-id" not in {k.lower() for k in request_headers}:
            request_headers = {**request_headers, "x-user-id": user_id}
        response = await HTTP_CLIENT.request(
            method,
            url,
            params=params,
            json=json_body,
            headers=request_headers,
        )
    except httpx.RequestError as exc:
        return {"ok": False, "error": str(exc)}

    try:
        payload = response.json()
    except json.JSONDecodeError:
        payload = {"raw": response.text}

    if response.status_code >= 400:
        return {"ok": False, "status": response.status_code, "error": payload}

    return {"ok": True, "data": payload}


async def tool_get_treasury_balance(_: Dict[str, Any], user_id: Optional[str] = None) -> Dict[str, Any]:
    return await backend_request("GET", "/api/treasury/balance", user_id=user_id)


async def tool_get_treasury_history(args: Dict[str, Any], user_id: Optional[str] = None) -> Dict[str, Any]:
    params: Dict[str, Any] = {}
    if "limit" in args:
        params["limit"] = args["limit"]
    if "offset" in args:
        params["offset"] = args["offset"]
    return await backend_request("GET", "/api/treasury/history", params=params, user_id=user_id)


async def tool_get_wallet(_: Dict[str, Any], user_id: Optional[str] = None) -> Dict[str, Any]:
    return await backend_request("GET", "/api/treasury/wallet", user_id=user_id)


async def tool_get_spending_analytics(_: Dict[str, Any], user_id: Optional[str] = None) -> Dict[str, Any]:
    return await backend_request("GET", "/api/treasury/analytics", user_id=user_id)


async def tool_list_policies(_: Dict[str, Any], user_id: Optional[str] = None) -> Dict[str, Any]:
    return await backend_request("GET", "/api/policy", user_id=user_id)


async def tool_create_policy(args: Dict[str, Any], user_id: Optional[str] = None) -> Dict[str, Any]:
    name = args.get("name")
    rules = args.get("rules")
    if not name or not rules:
        return {"ok": False, "error": "name and rules are required"}
    payload = {
        "name": name,
        "description": args.get("description"),
        "rules": rules,
    }
    return await backend_request("POST", "/api/policy", json_body=payload, user_id=user_id)


async def tool_update_policy(args: Dict[str, Any], user_id: Optional[str] = None) -> Dict[str, Any]:
    policy_id = args.get("policy_id")
    if not policy_id:
        return {"ok": False, "error": "policy_id is required"}
    payload = {
        "name": args.get("name"),
        "description": args.get("description"),
        "enabled": args.get("enabled"),
        "rules": args.get("rules"),
    }
    return await backend_request("PUT", f"/api/policy/{policy_id}", json_body=payload, user_id=user_id)


async def tool_delete_policy(args: Dict[str, Any], user_id: Optional[str] = None) -> Dict[str, Any]:
    policy_id = args.get("policy_id")
    if not policy_id:
        return {"ok": False, "error": "policy_id is required"}
    return await backend_request("DELETE", f"/api/policy/{policy_id}", user_id=user_id)


async def tool_validate_payment(args: Dict[str, Any], user_id: Optional[str] = None) -> Dict[str, Any]:
    amount = args.get("amount")
    recipient = args.get("recipient")
    if not amount or not recipient:
        return {"ok": False, "error": "amount and recipient are required"}
    payload = {
        "amount": amount,
        "recipient": recipient,
        "category": args.get("category"),
        "description": args.get("description"),
    }
    return await backend_request("POST", "/api/policy/validate", json_body=payload, user_id=user_id)


async def tool_execute_payment(args: Dict[str, Any], user_id: Optional[str] = None) -> Dict[str, Any]:
    recipient = args.get("recipient")
    amount = args.get("amount")
    if not recipient or not amount:
        return {"ok": False, "error": "recipient and amount are required"}
    payload = {
        "recipient": recipient,
        "amount": amount,
        "category": args.get("category"),
        "description": args.get("description"),
        "metadata": args.get("metadata"),
    }
    return await backend_request("POST", "/api/payments/execute", json_body=payload, user_id=user_id)


async def tool_x402_fetch(args: Dict[str, Any], user_id: Optional[str] = None) -> Dict[str, Any]:
    url = args.get("url")
    if not url:
        return {"ok": False, "error": "url is required"}
    payload = {
        "url": url,
        "method": args.get("method", "GET"),
        "body": args.get("body"),
        "headers": args.get("headers"),
        "category": args.get("category"),
    }
    return await backend_request("POST", "/api/payments/x402/fetch", json_body=payload, user_id=user_id)


async def tool_get_x402_status(_: Dict[str, Any], user_id: Optional[str] = None) -> Dict[str, Any]:
    return await backend_request("GET", "/api/payments/x402/status", user_id=user_id)


async def tool_list_vendors(_: Dict[str, Any], user_id: Optional[str] = None) -> Dict[str, Any]:
    return await backend_request("GET", "/api/vendors", user_id=user_id)


async def tool_search_products(args: Dict[str, Any], user_id: Optional[str] = None) -> Dict[str, Any]:
    query = args.get("query")
    if not query:
        return {"ok": False, "error": "query is required"}
    return await backend_request("GET", "/api/vendors/search", params={"q": query}, user_id=user_id)


async def tool_get_vendor(args: Dict[str, Any], user_id: Optional[str] = None) -> Dict[str, Any]:
    vendor_id = args.get("vendor_id")
    if not vendor_id:
        return {"ok": False, "error": "vendor_id is required"}
    return await backend_request("GET", f"/api/vendors/{vendor_id}", user_id=user_id)


async def tool_list_vendor_products(args: Dict[str, Any], user_id: Optional[str] = None) -> Dict[str, Any]:
    vendor_id = args.get("vendor_id")
    if not vendor_id:
        return {"ok": False, "error": "vendor_id is required"}
    return await backend_request("GET", f"/api/vendors/{vendor_id}/products", user_id=user_id)


async def tool_get_product(args: Dict[str, Any], user_id: Optional[str] = None) -> Dict[str, Any]:
    vendor_id = args.get("vendor_id")
    product_id = args.get("product_id")
    if not vendor_id or not product_id:
        return {"ok": False, "error": "vendor_id and product_id are required"}
    return await backend_request("GET", f"/api/vendors/{vendor_id}/products/{product_id}", user_id=user_id)


async def tool_purchase_product(args: Dict[str, Any], user_id: Optional[str] = None) -> Dict[str, Any]:
    vendor_id = args.get("vendor_id")
    product_id = args.get("product_id")
    if not vendor_id or not product_id:
        return {"ok": False, "error": "vendor_id and product_id are required"}
    url = f"{BACKEND_URL}/api/vendors/{vendor_id}/purchase/{product_id}"
    payload = {
        "url": url,
        "method": "POST",
        "category": args.get("category", "vendor-purchase"),
    }
    return await backend_request("POST", "/api/payments/x402/fetch", json_body=payload, user_id=user_id)


async def tool_list_orders(_: Dict[str, Any], user_id: Optional[str] = None) -> Dict[str, Any]:
    return await backend_request("GET", "/api/vendors/orders/all", user_id=user_id)


TOOL_HANDLERS = {
    "get_treasury_balance": tool_get_treasury_balance,
    "get_treasury_history": tool_get_treasury_history,
    "get_wallet": tool_get_wallet,
    "get_spending_analytics": tool_get_spending_analytics,
    "list_policies": tool_list_policies,
    "create_policy": tool_create_policy,
    "create_spending_policy": tool_create_policy,
    "update_policy": tool_update_policy,
    "update_spending_policy": tool_update_policy,
    "delete_policy": tool_delete_policy,
    "delete_spending_policy": tool_delete_policy,
    "validate_payment": tool_validate_payment,
    "execute_payment": tool_execute_payment,
    "x402_fetch": tool_x402_fetch,
    "get_x402_status": tool_get_x402_status,
    "list_vendors": tool_list_vendors,
    "search_products": tool_search_products,
    "get_vendor": tool_get_vendor,
    "list_vendor_products": tool_list_vendor_products,
    "get_product": tool_get_product,
    "purchase_product": tool_purchase_product,
    "list_orders": tool_list_orders,
}


def extract_metadata(
    response: types.GenerateContentResponse,
    include_thoughts: bool,
) -> Dict[str, Any]:
    metadata: Dict[str, Any] = {}
    if not response.candidates:
        return metadata

    candidate = response.candidates[0]
    tool_calls: List[Dict[str, Any]] = []
    thoughts: List[str] = []

    if candidate.grounding_metadata:
        queries = candidate.grounding_metadata.web_search_queries
        if queries:
            tool_calls.append({"tool": "google_search", "queries": queries})

        sources: List[Dict[str, Any]] = []
        if candidate.grounding_metadata.grounding_chunks:
            for chunk in candidate.grounding_metadata.grounding_chunks:
                if chunk.web:
                    sources.append({"uri": chunk.web.uri, "title": chunk.web.title})
        if sources:
            metadata["sources"] = sources

    if candidate.content and candidate.content.parts:
        for part in candidate.content.parts:
            if include_thoughts and part.thought and part.text:
                thoughts.append(part.text)
            if part.function_call:
                tool_calls.append(
                    {"tool": part.function_call.name, "args": part.function_call.args}
                )

    if tool_calls:
        metadata["tool_calls"] = tool_calls
    if thoughts:
        metadata["thoughts"] = thoughts
    return metadata


def extract_text(response: types.GenerateContentResponse) -> str:
    if not response.candidates:
        return ""
    candidate = response.candidates[0]
    if not candidate.content or not candidate.content.parts:
        return ""
    parts = [part.text for part in candidate.content.parts if getattr(part, "text", None)]
    return "".join(parts).strip()


def build_tool_fallback(executed_tools: List[Dict[str, Any]]) -> str:
    if not executed_tools:
        return ""

    failed_tools = [t for t in executed_tools if not t["result"].get("ok", True)]
    successful_tools = [t for t in executed_tools if t["result"].get("ok", True)]

    parts: List[str] = []
    if failed_tools:
        for tool in failed_tools:
            error = tool["result"].get("error", "Unknown error")
            error_str = str(error) if not isinstance(error, str) else error
            if "policy" in error_str.lower() or "blocked" in error_str.lower():
                parts.append(f"⚠️ Action blocked: {error_str}")
            else:
                parts.append(f"❌ {tool['name']} failed: {error_str}")

    if successful_tools:
        for tool in successful_tools:
            data = tool["result"].get("data", {})
            name = tool["name"]

            if not isinstance(data, dict):
                continue

            if name == "purchase_product":
                if data.get("success"):
                    order = data.get("order", {})
                    product = order.get("product", {})
                    parts.append(
                        f"✅ Purchased **{product.get('name', 'item')}** for "
                        f"**{product.get('price', '?')} USDC** from {order.get('vendor', 'vendor')}"
                    )
                elif data.get("paymentMade"):
                    parts.append(f"✅ Payment of {data.get('paymentAmount', '?')} USDC completed")

            elif name == "get_treasury_balance":
                amount = data.get("amount", data.get("available"))
                if amount:
                    parts.append(f"💰 Balance: **{amount} USDC**")

            elif name == "list_vendors":
                vendors = data.get("vendors", [])
                if vendors:
                    parts.append(f"📋 Found {len(vendors)} vendors available")

            elif name in ("create_policy", "update_policy", "delete_policy"):
                if name == "create_policy":
                    parts.append(f"✅ Policy created: {data.get('name', 'unnamed')}")
                elif name == "delete_policy":
                    parts.append("✅ Policy deleted successfully")
                else:
                    parts.append(f"✅ Policy updated: {data.get('name', 'unnamed')}")

    if parts:
        return "\n".join(parts)

    tool_names = [t["name"] for t in executed_tools]
    return f"Completed: {', '.join(tool_names)}. Expand '🔧 tools executed' for details."


def sanitize_user_visible_text(text: str) -> Tuple[str, List[str]]:
    cleaned = text.strip()
    if not cleaned:
        return text, []
    lower = cleaned.lower()
    if lower.startswith("plan:"):
        return "", [cleaned]
    return text, []


async def run_tool_loop(
    contents: List[types.Content],
    config: types.GenerateContentConfig,
    model: str,
    user_id: Optional[str],
) -> Tuple[Optional[types.GenerateContentResponse], List[Dict[str, Any]], List[types.Content]]:
    executed_tools: List[Dict[str, Any]] = []
    last_response: Optional[types.GenerateContentResponse] = None

    for _ in range(MAX_TOOL_STEPS):
        response = await asyncio.to_thread(
            AgentClient.models.generate_content,
            model=model,
            contents=contents,
            config=config,
        )
        last_response = response

        if not response.candidates:
            break

        candidate = response.candidates[0]
        if not candidate.content or not candidate.content.parts:
            break

        function_calls = [
            part.function_call
            for part in candidate.content.parts
            if part.function_call
        ]

        if not function_calls:
            break

        contents.append(candidate.content)

        for function_call in function_calls:
            args = normalize_args(function_call.args)
            handler = TOOL_HANDLERS.get(function_call.name)
            if not handler:
                result = {"ok": False, "error": f"Unknown tool: {function_call.name}"}
            else:
                result = await handler(args, user_id)

            executed_tools.append(
                {"name": function_call.name, "args": args, "result": result}
            )

            response_part = types.Part(
                function_response=types.FunctionResponse(
                    name=function_call.name,
                    response=result,
                )
            )
            contents.append(types.Content(role="tool", parts=[response_part]))

    return last_response, executed_tools, contents


async def run_with_tools(
    contents: List[types.Content],
    config: types.GenerateContentConfig,
    model: str,
    user_id: Optional[str],
) -> Tuple[types.GenerateContentResponse, List[Dict[str, Any]]]:
    last_response, executed_tools, _ = await run_tool_loop(contents, config, model, user_id)

    if last_response is None:
        raise HTTPException(status_code=500, detail="Model did not return a response.")

    return last_response, executed_tools


async def generate_assistant_message(
    messages: List[Dict[str, Any]],
    system_prompt: str,
    model: str,
    include_thoughts: bool,
    use_tools: bool,
    use_search: bool,
    user_id: Optional[str],
) -> Dict[str, Any]:
    if not AgentClient:
        raise HTTPException(
            status_code=500,
            detail="GOOGLE_AI_API_KEY is not set for the AI service.",
        )

    if use_tools and use_search:
        raise HTTPException(
            status_code=400,
            detail="Function tools and Google Search can't be used in the same call.",
        )

    tools: List[types.Tool] = []
    if use_search:
        tools.append(grounding_tool)
    if use_tools:
        tools.append(function_tool)

    config = types.GenerateContentConfig(
        system_instruction=system_prompt,
        max_output_tokens=10000,
        thinking_config=types.ThinkingConfig(
            include_thoughts=include_thoughts,
            thinking_level="high",
        ),
        tools=tools,
    )

    contents = build_contents(messages)

    if use_tools:
        response, executed_tools = await run_with_tools(contents, config, model, user_id)
    else:
        response = await asyncio.to_thread(
            AgentClient.models.generate_content,
            model=model,
            contents=contents,
            config=config,
        )
        executed_tools = []

    metadata = extract_metadata(response, include_thoughts)
    if executed_tools:
        metadata["executed_tools"] = executed_tools

    content = extract_text(response)
    content, extra_thoughts = sanitize_user_visible_text(content)
    if extra_thoughts:
        metadata["thoughts"] = (metadata.get("thoughts") or []) + extra_thoughts

    # If no text response but tools were executed, generate a summary
    if not content and executed_tools:
        content = build_tool_fallback(executed_tools)
    if not content:
        content = "I can proceed if you confirm. What would you like me to do next?"

    return {"content": content, "metadata": metadata or None}


def _unique_title(candidate: str, existing_titles: List[str]) -> str:
    cleaned = candidate.strip() or "AutoWealth Session"
    existing = {title.lower() for title in existing_titles if title}
    if cleaned.lower() not in existing:
        return cleaned
    for idx in range(2, 10):
        alt = f"{cleaned} {idx}"
        if alt.lower() not in existing:
            return alt
    return f"{cleaned} {uuid.uuid4().hex[:4]}"


async def generate_chat_title(context_text: str, existing_titles: List[str], model: str) -> str:
    if not AgentClient:
        return _unique_title(context_text[:40].strip() or "New Chat", existing_titles)

    existing_text = ", ".join([t for t in existing_titles if t]) or "None"
    prompt = (
        "Create a short 3-5 word title summarizing this conversation. "
        "Use title case. Avoid generic titles like 'Auto', 'Chat', 'Session', or 'Conversation'. "
        "Avoid duplicating or closely matching existing titles. "
        "Do not copy the user's words verbatim. No quotes.\n\n"
        f"Existing titles: {existing_text}\n"
        f"Conversation excerpt:\n{context_text}"
    )
    response = await asyncio.to_thread(
        AgentClient.models.generate_content,
        model=model,
        contents=[types.Content(role="user", parts=[types.Part(text=prompt)])],
        config=types.GenerateContentConfig(
            max_output_tokens=50,
            tools=[],
        ),
    )
    title = extract_text(response)
    if not title:
        return _unique_title(context_text[:40].strip() or "New Chat", existing_titles)
    cleaned = title.replace('"', '').replace("'", '').strip()
    if cleaned.lower().startswith("user:"):
        cleaned = cleaned.split("user:", 1)[-1].strip()
    if "assistant:" in cleaned.lower():
        parts = cleaned.split("assistant:", 1)
        cleaned = parts[0].strip()
    if cleaned.lower() == context_text.strip().lower():
        cleaned = "AutoWealth Session"
    return _unique_title(cleaned[:60], existing_titles)


async def build_title_context(chat_id: str, assistant_text: Optional[str]) -> Tuple[str, List[str]]:
    chat = await db_get_chat(chat_id)
    if not chat:
        return "", []
    chats = await db_list_chats(chat["user_id"])
    titles = [c.get("title") for c in chats if c.get("title")]
    early_messages = await db_list_messages_first(chat_id, limit=2)
    lines: List[str] = []
    for msg in early_messages:
        role = str(msg.get("role") or "").capitalize()
        content = str(msg.get("content") or "").strip()
        if content:
            lines.append(f"{role}: {content}")
    if assistant_text and (not lines or not lines[-1].lower().startswith("assistant:")):
        lines.append(f"Assistant: {assistant_text.strip()}")
    context = "\n".join(lines).strip()
    return context[:800], [t for t in titles if t]


async def maybe_set_chat_title(chat_id: str, assistant_text: Optional[str], model: str) -> None:
    chat = await db_get_chat(chat_id)
    if not chat:
        return
    existing_title = (chat.get("title") or "").strip()
    first_user = await db_get_first_user_message(chat_id)
    existing_lower = existing_title.lower()
    placeholder = (
        existing_lower in ("new chat", first_user.lower())
        or existing_lower.startswith("user:")
        or "assistant:" in existing_lower
    )
    if existing_title and not placeholder:
        return

    context, titles = await build_title_context(chat_id, assistant_text)
    if not context:
        return
    title = await generate_chat_title(context, titles, model)
    chat = await db_get_chat(chat_id)
    if not chat:
        return
    existing_title = (chat.get("title") or "").strip()
    existing_lower = existing_title.lower()
    placeholder = (
        existing_lower in ("new chat", first_user.lower())
        or existing_lower.startswith("user:")
        or "assistant:" in existing_lower
    )
    if existing_title and not placeholder:
        return
    await db_update_chat(chat_id, {"title": title, "updated_at": now_iso()})


## Streaming helper is implemented inline in the SSE endpoint to avoid returning values from an async generator.


@app.get("/health")
async def health_check() -> Dict[str, Any]:
    return {"status": "ok", "timestamp": now_iso()}


@app.post("/api/chats", response_model=ChatResponse)
async def create_chat(request: ChatCreateRequest) -> Dict[str, Any]:
    chat_id = new_id("chat")
    now = now_iso()
    chat = {
        "id": chat_id,
        "user_id": request.user_id,
        "title": request.title,
        "system_prompt": request.system_prompt or DEFAULT_SYSTEM_PROMPT,
        "model": request.model or DEFAULT_MODEL,
        "created_at": now,
        "updated_at": now,
    }

    await db_create_chat(chat)

    return chat


@app.get("/api/users/{user_id}/chats", response_model=List[ChatResponse])
async def list_chats(user_id: str) -> List[Dict[str, Any]]:
    return await db_list_chats(user_id)


@app.get("/api/chats/{chat_id}", response_model=ChatResponse)
async def get_chat(chat_id: str) -> Dict[str, Any]:
    chat = await db_get_chat(chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found.")
    return chat


@app.patch("/api/chats/{chat_id}", response_model=ChatResponse)
async def update_chat(chat_id: str, request: ChatUpdateRequest) -> Dict[str, Any]:
    chat = await db_get_chat(chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found.")
    updates: Dict[str, Any] = {}
    if request.title is not None:
        updates["title"] = request.title
        updates["updated_at"] = now_iso()
    if updates:
        await db_update_chat(chat_id, updates)
    updated = await db_get_chat(chat_id)
    if not updated:
        raise HTTPException(status_code=404, detail="Chat not found.")
    return updated


@app.delete("/api/chats/{chat_id}")
async def delete_chat(chat_id: str) -> Dict[str, Any]:
    chat = await db_get_chat(chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found.")
    await db_delete_chat(chat_id)
    return {"ok": True}


@app.get("/api/chats/{chat_id}/messages", response_model=ChatMessagesResponse)
async def list_messages(
    chat_id: str,
    limit: Optional[int] = Query(default=None, ge=1, le=500),
) -> Dict[str, Any]:
    chat = await db_get_chat(chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found.")
    messages = await db_list_messages(chat_id, limit)
    return {"chat_id": chat_id, "messages": messages}


@app.post("/api/chats/{chat_id}/messages", response_model=ChatMessageCreateResponse)
async def create_message(
    chat_id: str,
    request: MessageCreateRequest,
) -> Dict[str, Any]:
    chat = await db_get_chat(chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found.")
    history = await db_list_messages(chat_id)
    message = build_message(request.role, request.content)
    await db_insert_message(chat_id, chat["user_id"], message)
    await db_update_chat(chat_id, {"updated_at": message["created_at"]})
    message_snapshot = [*history, message]
    system_prompt = chat["system_prompt"]
    model = request.model or chat["model"] or DEFAULT_MODEL

    assistant_message = None
    if request.respond and request.role == "user":
        assistant = await generate_assistant_message(
            messages=message_snapshot,
            system_prompt=system_prompt,
            model=model,
            include_thoughts=request.include_thoughts,
            use_tools=request.use_tools,
            use_search=request.use_search,
            user_id=chat["user_id"],
        )
        assistant_message = build_message("assistant", assistant["content"], assistant["metadata"])
        await db_insert_message(chat_id, chat["user_id"], assistant_message)
        await db_update_chat(chat_id, {"updated_at": assistant_message["created_at"]})
        await maybe_set_chat_title(chat_id, assistant["content"], model)

    return {
        "chat_id": chat_id,
        "message": message,
        "assistant_message": assistant_message,
    }


@app.post("/api/chats/{chat_id}/messages/stream")
async def create_message_stream(
    chat_id: str,
    request: MessageCreateRequest,
):
    chat = await db_get_chat(chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found.")
    history = await db_list_messages(chat_id)
    message = build_message(request.role, request.content)
    await db_insert_message(chat_id, chat["user_id"], message)
    await db_update_chat(chat_id, {"updated_at": message["created_at"]})
    message_snapshot = [*history, message]
    system_prompt = chat["system_prompt"]
    model = request.model or chat["model"] or DEFAULT_MODEL
    user_id = chat["user_id"]  # Capture before entering generator

    if not request.respond or request.role != "user":
        raise HTTPException(status_code=400, detail="Streaming only supports user messages with respond=true.")
    if request.use_search:
        raise HTTPException(status_code=400, detail="Streaming does not support Google Search mode.")

    async def event_stream():
        yield f"data: {json.dumps({'type': 'ack', 'message': message})}\n\n"
        full_text = ""
        metadata: Optional[Dict[str, Any]] = None
        try:
            if not AgentClient:
                raise HTTPException(
                    status_code=500,
                    detail="GOOGLE_AI_API_KEY is not set for the AI service.",
                )

            contents = build_contents(message_snapshot)
            executed_tools: List[Dict[str, Any]] = []

            if request.use_tools:
                tool_config = types.GenerateContentConfig(
                    system_instruction=system_prompt,
                    max_output_tokens=10000,
                    thinking_config=types.ThinkingConfig(
                        include_thoughts=request.include_thoughts,
                        thinking_level="high",
                    ),
                    tools=[function_tool],
                )

                # Inline tool loop so we can stream tool calls and thoughts
                for _ in range(MAX_TOOL_STEPS):
                    response = await asyncio.to_thread(
                        AgentClient.models.generate_content,
                        model=model,
                        contents=contents,
                        config=tool_config,
                    )

                    if not response.candidates:
                        break
                    candidate = response.candidates[0]
                    if not candidate.content or not candidate.content.parts:
                        break

                    # Stream thoughts if available and requested
                    if request.include_thoughts:
                        for part in candidate.content.parts:
                            if getattr(part, "thought", False) and getattr(part, "text", None):
                                yield f"data: {json.dumps({'type': 'thought', 'text': part.text})}\n\n"

                    function_calls = [
                        part.function_call
                        for part in candidate.content.parts
                        if part.function_call
                    ]
                    if not function_calls:
                        break

                    contents.append(candidate.content)

                    for function_call in function_calls:
                        args = normalize_args(function_call.args)
                        yield f"data: {json.dumps({'type': 'tool_call', 'name': function_call.name, 'args': args})}\n\n"
                        handler = TOOL_HANDLERS.get(function_call.name)
                        if not handler:
                            result = {"ok": False, "error": f"Unknown tool: {function_call.name}"}
                        else:
                            result = await handler(args, user_id)

                        executed_tools.append(
                            {"name": function_call.name, "args": args, "result": result}
                        )

                        yield f"data: {json.dumps({'type': 'tool_result', 'name': function_call.name, 'result': result})}\n\n"

                        response_part = types.Part(
                            function_response=types.FunctionResponse(
                                name=function_call.name,
                                response=result,
                            )
                        )
                        contents.append(types.Content(role="tool", parts=[response_part]))

            stream_config = types.GenerateContentConfig(
                system_instruction=system_prompt,
                max_output_tokens=10000,
                thinking_config=types.ThinkingConfig(
                    include_thoughts=request.include_thoughts,
                    thinking_level="high",
                ),
                tools=[],
            )

            stream = AgentClient.models.generate_content_stream(
                model=model,
                contents=contents,
                config=stream_config,
            )

            plan_buffer = ""
            plan_mode: Optional[bool] = None
            buffered_text = ""

            async for chunk in iterate_in_threadpool(stream):
                if getattr(chunk, "thought", None) and request.include_thoughts:
                    yield f"data: {json.dumps({'type': 'thought', 'text': chunk.thought})}\n\n"
                if chunk.text:
                    text = chunk.text
                    if plan_mode is None:
                        buffered_text += text
                        if len(buffered_text) >= 6 or "\n" in buffered_text:
                            trimmed = buffered_text.lstrip().lower()
                            if trimmed.startswith("plan:") or trimmed.startswith("thought:") or trimmed.startswith("reasoning:") or trimmed.startswith("analysis:"):
                                plan_mode = True
                                plan_buffer += buffered_text
                            else:
                                plan_mode = False
                                full_text += buffered_text
                                yield f"data: {json.dumps({'type': 'delta', 'text': buffered_text})}\n\n"
                            buffered_text = ""
                        continue

                    if plan_mode:
                        plan_buffer += text
                        continue

                    full_text += text
                    yield f"data: {json.dumps({'type': 'delta', 'text': text})}\n\n"

            metadata = {"executed_tools": executed_tools} if executed_tools else None
        except HTTPException as exc:
            yield f"data: {json.dumps({'type': 'error', 'error': exc.detail})}\n\n"
            return
        except Exception as exc:  # pragma: no cover - fallback
            yield f"data: {json.dumps({'type': 'error', 'error': str(exc)})}\n\n"
            return

        if plan_mode is None and buffered_text:
            full_text += buffered_text
            yield f"data: {json.dumps({'type': 'delta', 'text': buffered_text})}\n\n"
        if plan_mode and plan_buffer:
            extra_thoughts = [plan_buffer.strip()]
        else:
            extra_thoughts = []
        full_text, sanitized_thoughts = sanitize_user_visible_text(full_text)
        extra_thoughts.extend(sanitized_thoughts)
        if extra_thoughts:
            for thought in extra_thoughts:
                yield f"data: {json.dumps({'type': 'thought', 'text': thought})}\n\n"
            if metadata:
                metadata["thoughts"] = (metadata.get("thoughts") or []) + extra_thoughts
            else:
                metadata = {"thoughts": extra_thoughts}

        if not full_text:
            fallback = build_tool_fallback(executed_tools)
            if not fallback:
                response = await asyncio.to_thread(
                    AgentClient.models.generate_content,
                    model=model,
                    contents=contents,
                    config=stream_config,
                )
                fallback = extract_text(response)

            if fallback:
                yield f"data: {json.dumps({'type': 'delta', 'text': fallback})}\n\n"
                full_text = fallback
            else:
                fallback = "I can proceed if you confirm. What would you like me to do next?"
                yield f"data: {json.dumps({'type': 'delta', 'text': fallback})}\n\n"
                full_text = fallback

        assistant_message = build_message("assistant", full_text, metadata)
        await db_insert_message(chat_id, user_id, assistant_message)
        await db_update_chat(chat_id, {"updated_at": assistant_message["created_at"]})

        yield f"data: {json.dumps({'type': 'done', 'message': assistant_message})}\n\n"

        await maybe_set_chat_title(chat_id, full_text, model)

    return StreamingResponse(event_stream(), media_type="text/event-stream")


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "3002"))
    uvicorn.run(app, host="0.0.0.0", port=port)
