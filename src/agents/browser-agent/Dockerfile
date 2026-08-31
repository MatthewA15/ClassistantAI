FROM python:3.13-slim AS obscura-builder

# Get curl (because python:3.13-slim doesn't have it)
RUN apt-get update && apt-get install --no-install-recommends -y \
        curl \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /tmp/obscura
# Download Obscura
RUN curl -fsSLO "https://github.com/h4ckf0r0day/obscura/releases/latest/download/obscura-x86_64-linux.tar.gz" \
    && tar xzf obscura-x86_64-linux.tar.gz \
    && rm obscura-x86_64-linux.tar.gz \
    && chmod +x obscura obscura-worker \
    && ./obscura --version

# ---- Stage 2: final runtime image ----
FROM python:3.13-slim

# Copy both obscura binaries into /usr/local/bin (co-located, on PATH for myuser).
COPY --from=obscura-builder /tmp/obscura/obscura        /usr/local/bin/obscura
COPY --from=obscura-builder /tmp/obscura/obscura-worker  /usr/local/bin/obscura-worker

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

RUN adduser --disabled-password --gecos "" myuser && \
    chown -R myuser:myuser /app

COPY . .

USER myuser

ENV PATH="/home/myuser/.local/bin:$PATH"

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port $PORT"]
