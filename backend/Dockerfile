FROM python:3.11-slim
WORKDIR /app
COPY backend/ ./backend
WORKDIR /app/backend
RUN pip install --no-cache-dir -r requirements.txt
EXPOSE 8000
# CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
CMD ["gunicorn", "-w", "4", "-k", "uvicorn.workers.UvicornWorker", "main:app", "--bind", "0.0.0.0:8000"]
