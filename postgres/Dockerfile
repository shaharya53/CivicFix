FROM postgis/postgis:15-3.4

# Install build dependencies, download, build and install pgvector
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    build-essential \
    postgresql-server-dev-15 \
    && cd /tmp \
    && git clone --branch v0.5.1 https://github.com/pgvector/pgvector.git \
    && cd pgvector \
    && make \
    && make install \
    && apt-get remove -y git build-essential postgresql-server-dev-15 \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/* /tmp/pgvector
