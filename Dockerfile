# Use a base image with Node.js and C++ build tools
FROM node:22-bullseye

# Install build dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    git \
    libsqlite3-dev \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy the entire repository
COPY . .

# Install Node.js dependencies
RUN npm install

# Build the C++ core
WORKDIR /app/cpp_core
RUN mkdir build && cd build && \
    cmake .. && \
    make

# Switch back to app root
WORKDIR /app

# Expose port (if web dashboard is active)
EXPOSE 8080

# Default command
CMD ["node", "scripts/cli/sovereign_cli.js", "watch"]
