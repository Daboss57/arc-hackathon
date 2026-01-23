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

dotenv.load_dotenv(dotenv.find_dotenv())

API_KEY = os.getenv("GOOGLE_AI_API_KEY")
if not API_KEY:
    API_KEY = dotenv.get_key(dotenv.find_dotenv(), "GOOGLE_AI_API_KEY")

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:3001").rstrip("/")

AgentClient = genai.Client(api_key=API_KEY) if API_KEY else None

DEFAULT_MODEL = os.getenv("GEMINI_MODEL", "gemini-3-flash-preview")
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

MAX_TOOL_STEPS = int(os.getenv("MAX_TOOL_STEPS", "8"))  # Increased to allow search + purchase
HTTP_TIMEOUT = float(os.getenv("BACKEND_TIMEOUT", "30"))

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
            name="delete_policy",
            description="Delete a spending policy.",
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
    yield
    await HTTP_CLIENT.aclose()


app = FastAPI(title="AutoWealth AI Service", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

STORE_LOCK = asyncio.Lock()
CHATS: Dict[str, Dict[str, Any]] = {}
USER_CHATS: Dict[str, List[str]] = {}


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


class MessageCreateRequest(BaseModel):
    content: str = Field(..., min_length=1)
    role: Literal["user", "assistant", "system"] = "user"
    respond: bool = True
    model: Optional[str] = None
    include_thoughts: bool = False
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


def append_message(
    chat: Dict[str, Any],
    role: str,
    content: str,
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    message = {
        "id": new_id("msg"),
        "role": role,
        "content": content,
        "created_at": now_iso(),
        "metadata": metadata,
    }
    chat["messages"].append(message)
    chat["updated_at"] = now_iso()
    return message


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
    "update_policy": tool_update_policy,
    "delete_policy": tool_delete_policy,
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
        max_output_tokens=1000,
        thinking_config=types.ThinkingConfig(
            include_thoughts=include_thoughts,
            thinking_level="low",
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

    content = response.text or ""
    
    # If no text response but tools were executed, generate a summary
    if not content and executed_tools:
        failed_tools = [t for t in executed_tools if not t["result"].get("ok", True)]
        successful_tools = [t for t in executed_tools if t["result"].get("ok", True)]
        
        parts = []
        if failed_tools:
            for tool in failed_tools:
                error = tool["result"].get("error", "Unknown error")
                # Convert error to string if it's a dict or other type
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
                    
                # Handle purchase_product (x402 response)
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
                
                # Handle balance queries
                elif name == "get_treasury_balance":
                    amount = data.get("amount", data.get("available"))
                    if amount:
                        parts.append(f"💰 Balance: **{amount} USDC**")
                
                # Handle vendor listings
                elif name == "list_vendors":
                    vendors = data.get("vendors", [])
                    if vendors:
                        parts.append(f"📋 Found {len(vendors)} vendors available")
                
                # Handle policy operations
                elif name in ("create_policy", "update_policy", "delete_policy"):
                    if name == "create_policy":
                        parts.append(f"✅ Policy created: {data.get('name', 'unnamed')}")
                    elif name == "delete_policy":
                        parts.append("✅ Policy deleted successfully")
                    else:
                        parts.append(f"✅ Policy updated: {data.get('name', 'unnamed')}")
        
        if parts:
            content = "\n".join(parts)
        else:
            # Last resort: summarize what tools ran
            tool_names = [t["name"] for t in executed_tools]
            content = f"Completed: {', '.join(tool_names)}. Expand '🔧 tools executed' for details."
    
    return {"content": content, "metadata": metadata or None}


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
        "messages": [],
    }

    async with STORE_LOCK:
        CHATS[chat_id] = chat
        USER_CHATS.setdefault(request.user_id, []).append(chat_id)

    return chat


@app.get("/api/users/{user_id}/chats", response_model=List[ChatResponse])
async def list_chats(user_id: str) -> List[Dict[str, Any]]:
    async with STORE_LOCK:
        chat_ids = USER_CHATS.get(user_id, [])
        return [CHATS[chat_id] for chat_id in chat_ids]


@app.get("/api/chats/{chat_id}", response_model=ChatResponse)
async def get_chat(chat_id: str) -> Dict[str, Any]:
    async with STORE_LOCK:
        chat = CHATS.get(chat_id)
        if not chat:
            raise HTTPException(status_code=404, detail="Chat not found.")
        return chat


@app.get("/api/chats/{chat_id}/messages", response_model=ChatMessagesResponse)
async def list_messages(
    chat_id: str,
    limit: Optional[int] = Query(default=None, ge=1, le=500),
) -> Dict[str, Any]:
    async with STORE_LOCK:
        chat = CHATS.get(chat_id)
        if not chat:
            raise HTTPException(status_code=404, detail="Chat not found.")
        messages = chat["messages"]
        if limit:
            messages = messages[-limit:]
        return {"chat_id": chat_id, "messages": messages}


@app.post("/api/chats/{chat_id}/messages", response_model=ChatMessageCreateResponse)
async def create_message(
    chat_id: str,
    request: MessageCreateRequest,
) -> Dict[str, Any]:
    async with STORE_LOCK:
        chat = CHATS.get(chat_id)
        if not chat:
            raise HTTPException(status_code=404, detail="Chat not found.")
        message = append_message(chat, request.role, request.content)
        message_snapshot = list(chat["messages"])
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
        async with STORE_LOCK:
            chat = CHATS.get(chat_id)
            if not chat:
                raise HTTPException(status_code=404, detail="Chat not found.")
            assistant_message = append_message(
                chat,
                "assistant",
                assistant["content"],
                assistant["metadata"],
            )

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
    async with STORE_LOCK:
        chat = CHATS.get(chat_id)
        if not chat:
            raise HTTPException(status_code=404, detail="Chat not found.")
        message = append_message(chat, request.role, request.content)
        message_snapshot = list(chat["messages"])
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
                    max_output_tokens=1000,
                    thinking_config=types.ThinkingConfig(
                        include_thoughts=request.include_thoughts,
                        thinking_level="low",
                    ),
                    tools=[function_tool],
                )
                _, executed_tools, contents = await run_tool_loop(
                    contents, tool_config, model, user_id
                )

            stream_config = types.GenerateContentConfig(
                system_instruction=system_prompt,
                max_output_tokens=1000,
                thinking_config=types.ThinkingConfig(
                    include_thoughts=False,
                    thinking_level="low",
                ),
                tools=[],
            )

            stream = AgentClient.models.generate_content_stream(
                model=model,
                contents=contents,
                config=stream_config,
            )

            async for chunk in iterate_in_threadpool(stream):
                if chunk.text:
                    full_text += chunk.text
                    yield f"data: {json.dumps({'type': 'delta', 'text': chunk.text})}\n\n"

            metadata = {"executed_tools": executed_tools} if executed_tools else None
        except HTTPException as exc:
            yield f"data: {json.dumps({'type': 'error', 'error': exc.detail})}\n\n"
            return
        except Exception as exc:  # pragma: no cover - fallback
            yield f"data: {json.dumps({'type': 'error', 'error': str(exc)})}\n\n"
            return

        if not full_text:
            yield f"data: {json.dumps({'type': 'error', 'error': 'No response generated'})}\n\n"
            return

        async with STORE_LOCK:
            current_chat = CHATS.get(chat_id)  # Renamed to avoid shadowing
            if not current_chat:
                yield f"data: {json.dumps({'type': 'error', 'error': 'Chat not found'})}\n\n"
                return
            assistant_message = append_message(current_chat, "assistant", full_text, metadata)


        yield f"data: {json.dumps({'type': 'done', 'message': assistant_message})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "3002"))
    uvicorn.run(app, host="0.0.0.0", port=port)
