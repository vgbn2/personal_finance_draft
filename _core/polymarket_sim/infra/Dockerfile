FROM python:3.11-slim

WORKDIR /app

# Requirements caching layer
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy simulator into app package mapping
# This will be /app/polymarket_sim due to Docker context
COPY . /app/polymarket_sim

# Configure ENV
ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1

EXPOSE 8000

# Execute module
CMD ["python", "-m", "polymarket_sim", "--strategies-dir", "polymarket_sim/strategies"]
