FROM searxng/searxng@sha256:7add5ffe7933e6b46aa3a26bed8a0c342c9a45ec331d9a8cf145e46b04b24f36

COPY lifecycle.patch /tmp/lifecycle.patch
RUN patch -p1 < /tmp/lifecycle.patch \
    && rm /tmp/lifecycle.patch \
    && rm searx/__pycache__/results.cpython-314.pyc \
          searx/search/processors/__pycache__/abstract.cpython-314.pyc
