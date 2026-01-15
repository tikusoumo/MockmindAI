from dotenv import load_dotenv
import os
from livekit import api

load_dotenv()
print(f"URL: {os.getenv('LIVEKIT_URL')}")
print(f"KEY: {os.getenv('LIVEKIT_API_KEY')}")
print(f"SECRET: {os.getenv('LIVEKIT_API_SECRET')}")
try:
    t = api.AccessToken(os.getenv('LIVEKIT_API_KEY'), os.getenv('LIVEKIT_API_SECRET'))
    print("Token creation success")
except Exception as e:
    print(f"Token creation failed: {e}")
