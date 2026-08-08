from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

app = FastAPI(title="NSE FNO Scanner API")

# Allow your frontend to call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Temporary storage for signals
latest_signals = []

@app.get("/")
def home():
    return {"status": "NSE FNO Scanner API is running"}

@app.get("/signals")
def get_signals():
    return {
        "count": len(latest_signals),
        "signals": latest_signals[-20:]  # last 20 signals
    }

@app.get("/health")
def health():
    return {"status": "ok"}

if __name__ == "__main__":
    uvicorn.run("api_server:app", host="0.0.0.0", port=8000, reload=True)
