FROM python:3.11-slim-bullseye

RUN apt-get update && apt-get install -y \
    git \
    build-essential \
    libxml2-dev \
    libxslt-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 55000

ENV MAVLINK_URL='tcp:127.0.0.1:5777'

CMD ["python", "main.py"]

# docker run --rm -it --network host <image_id>

