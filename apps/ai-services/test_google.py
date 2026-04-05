import asyncio
import os
from dotenv import load_dotenv

async def main():
    load_dotenv('../../.env')
    api_key = os.getenv('GOOGLE_API_KEY')
    print(f'Testing with API Key ending in: {api_key[-4:] if api_key else "None"}')

    from livekit.plugins import google
    from livekit.agents.llm import ChatContext, ChatMessage

    llm = google.LLM(model='gemini-2.0-flash', api_key=api_key)
    ctx = ChatContext()
    ctx.add_message(role="user", content="Hello, are you working? Please respond with a short sentence.")

    try:
        reply = llm.chat(chat_ctx=ctx)
        full_text = ""
        async for chunk in reply:
            if chunk.choices and chunk.choices[0].delta and chunk.choices[0].delta.content:
                full_text += chunk.choices[0].delta.content

        print(f"\\nResponse received successfully:\\n{full_text}")
    except Exception as e:
        print(f"Error testing Google LLM: {e}")

if __name__ == '__main__':
    asyncio.run(main())
