#!/bin/bash
set -e

echo "=== Step 1: Scraping ==="
python3 madi_scraper.py

echo "=== Step 2: Downloading images ==="
python3 madi_download_images.py

echo "=== Step 3: Uploading to Supabase ==="
SUPABASE_SERVICE_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNieWF5aXZhdHB1eWZsenNheXN2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODc1NDQ3MiwiZXhwIjoyMDk0MzMwNDcyfQ.nZYVYObW7AVJDYF6LuGQhP5-1AeGmX9BcYWQ-ZNdF_M' python3 upload_products.py

echo "=== All done! ==="
