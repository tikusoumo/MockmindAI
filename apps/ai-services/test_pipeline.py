import requests
import json
import os

# Settings from what we found
LLAMA_URL = "http://127.0.0.1:11436/v1/chat/completions"
TTS_URL = "http://127.0.0.1:8880/v1/audio/speech"
MODEL_NAME = "qwen3-4b"

def test_llm():
    print(f"Testing LLM at {LLAMA_URL}...")
    payload = {
        "model": MODEL_NAME,
        "messages": [{"role": "user", "content": "Say hello in one word."}],
        "stream": False
    }
    try:
        resp = requests.post(LLAMA_URL, json=payload, timeout=10)
        if resp.status_code == 200:
            print(f"✅ LLM Success: {resp.json()['choices'][0]['message']['content']}")
            return True
        else:
            print(f"❌ LLM Failed: {resp.status_code} - {resp.text}")
            return False
    except Exception as e:
        print(f"❌ LLM Error: {e}")
        return False

def test_tts():
    print(f"Testing TTS at {TTS_URL}...")
    payload = {
        "model": "kokoro",
        "input": "Hello",
        "voice": "af_nova"
    }
    try:
        resp = requests.post(TTS_URL, json=payload, timeout=10)
        if resp.status_code == 200:
            print(f"✅ TTS Success: Received {len(resp.content)} bytes of audio")
            return True
        else:
            print(f"❌ TTS Failed: {resp.status_code} - {resp.text}")
            return False
    except Exception as e:
        print(f"❌ TTS Error: {e}")
        return False

if __name__ == "__main__":
    print("--- Starting Pipeline Test ---")
    llm_ok = test_llm()
    tts_ok = test_tts()
    
    if llm_ok and tts_ok:
        print("\n🎉 Pipeline is functional!")
    else:
        print("\n⚠️ Pipeline has failures.")
