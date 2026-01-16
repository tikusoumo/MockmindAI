import requests
import sys

models = [
    {"name": "Llama (Port 11436)", "url": "http://localhost:11436/v1/models"},
    {"name": "Whisper (STT)", "url": "http://localhost:11435/v1/models"}, # Some endpoints might differ, but port check is key
    {"name": "Kokoro (TTS)", "url": "http://localhost:8880/v1/models"},
]

print("Checking Local Model Services...")
all_passing = True
for model in models:
    try:
        print(f"Checking {model['name']} at {model['url']}...")
        response = requests.get(model['url'], timeout=2)
        if response.status_code == 200:
             print(f"✅ {model['name']} is UP")
        else:
             print(f"⚠️ {model['name']} responded with status {response.status_code}")
    except requests.exceptions.ConnectionError:
        print(f"❌ {model['name']} is DOWN (Connection Refused)")
        all_passing = False
    except Exception as e:
        print(f"❌ {model['name']} Error: {e}")
        all_passing = False

if not all_passing:
    print("\nSome services are failing. Please check if they are running and on the correct ports.")
    sys.exit(1)
print("\nAll services check out!")
