import google.genai as genai
from google.genai import types
import dotenv

AgentClient = genai.Client(api_key=dotenv.get_key(dotenv.find_dotenv(), "GOOGLE_AI_API_KEY"))

system_prompt = '''
You are an AI assistant that helps users by providing concise and accurate information. 
When given a task, you should perform the necessary actions to fulfill the request effectively. if you are unsure about something, ask for clarification.
'''

grounding_tool = types.Tool(google_search=types.GoogleSearch())

config = types.GenerateContentConfig(
    system_instruction=system_prompt,
    max_output_tokens=1000,
    thinking_config=types.ThinkingConfig(include_thoughts=True, thinking_level="low"),
    tools=[grounding_tool],
)

query = "summarize this video https://youtu.be/qOr5-FrkElk?si=G7V17LoCXVIr2IaV"


def print_stream_chunk(chunk: types.GenerateContentResponse):
    emitted = False

    if chunk.text:
        print(chunk.text, end="", flush=True)
        emitted = True

    if not chunk.candidates:
        return emitted

    for candidate in chunk.candidates:
        if candidate.grounding_metadata:
            queries = candidate.grounding_metadata.web_search_queries
            if queries:
                print(f"\n[tool_call] google_search {queries}", end="", flush=True)
                emitted = True

        content = candidate.content
        if not content or not content.parts:
            continue

        for part in content.parts:
            if part.text and (part.thought or part.thought):
                print(f"\n[thought] {part.text}", end="", flush=True)
                emitted = True

            if part.function_call:
                print(
                    f"\n[tool_call] {part.function_call.name} {part.function_call.args}",
                    end="",
                    flush=True,
                )
                emitted = True

            if part.function_call:
                print(f"\n[tool_call] {part.function_call}", end="", flush=True)
                emitted = True

    return emitted


for chunk in AgentClient.models.generate_content_stream(
    model="gemini-3-flash-preview",
    contents=query,
    config=config,
):
    print_stream_chunk(chunk)
