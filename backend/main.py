# app/main.py

from fastapi import FastAPI

app = FastAPI()

@app.get("/")
def read_root():
    return {"message": "Hello, World!"}

# Example API endpoint
@app.get("/api/data")
def get_data():
    return {"data": "This is some backend data from FastAPI!"}
