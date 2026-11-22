#!/bin/bash
# Copy processed data into the web app (run after the Python pipeline).
set -e
cd "$(dirname "$0")/.."
mkdir -p web/data
cp data/processed/{model.json,model_report.json,zip_market.json,tract_hazard.json,applicants.json} web/data/
ls -la web/data
