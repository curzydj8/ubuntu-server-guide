name: Deploy site to Cloudflare Workers

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"

      - name: Install MkDocs
        run: pip install mkdocs-material jieba

      - name: Build site
        run: mkdocs build --strict

      - name: Remove source maps
        run: find site -name "*.map" -delete

      - name: Add cache and security headers
        run: |
          cat > site/_headers <<'HEADERS'
          /assets/*
            Cache-Control: public, max-age=31536000, immutable

          /*
            X-Content-Type-Options: nosniff
            Referrer-Policy: strict-origin-when-cross-origin
          HEADERS

      - name: Deploy to Workers
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: deploy --name ubuntu-server-guide --assets site --compatibility-date 2026-10-22
