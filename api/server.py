import os

import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host=os.getenv("WORKS_HOST", "0.0.0.0"),
        port=int(os.getenv("WORKS_PORT", "8788")),
        reload=os.getenv("WORKS_RELOAD", "") == "1",
    )
