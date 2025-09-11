# app/Dockerfile

# Use an official Python runtime as a parent image
FROM python:3.9-slim

# Set the working directory in the container
WORKDIR /app

# Copy the current directory contents into the container
COPY . /app

# Install dependencies
# RUN pip install --no-cache-dir fastapi uvicorn
# COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Expose port 80 for the FastAPI app
EXPOSE 80

# Command to run FastAPI app using Uvicorn server
# CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "80"]
CMD ["gunicorn", "-w", "4", "-k", "uvicorn.workers.UvicornWorker", "main:app", "--bind", "0.0.0.0:80"]
