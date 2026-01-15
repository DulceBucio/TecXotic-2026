FROM python:3.10-slim

# System deps
RUN apt update && apt install -y \
    gcc \
    python3-opencv \
    libgl1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY control_service/ /app
RUN pip install --no-cache-dir -r requirements.txt

CMD ["python", "main.py"]
