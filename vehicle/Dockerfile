FROM python:3.11-slim-bullseye

RUN apt-get update && apt-get install -y \
    git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

ENV MAVLINK_URL='tcp:127.0.0.1:5777'

CMD ["python", "main.py"]
