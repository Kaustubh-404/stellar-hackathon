#!/usr/bin/env bash
set -euo pipefail

# Start all demo seller agents
# Each agent is a paid service running on its own port

cd "$(dirname "$0")/.."

# Load env
source .env 2>/dev/null || true

echo "=============================================="
echo "  AgentPay Demo — Starting Seller Agents"
echo "=============================================="
echo ""

# Generate seller keys if not provided
if [ -z "${SELLER1_SECRET:-}" ]; then
  echo "Generating seller wallets..."
  SELLER1_SECRET=$(node -e "const { Keypair } = require('@stellar/stellar-sdk'); const kp = Keypair.random(); console.log(kp.secret())" 2>/dev/null || \
    cd packages/sdk && node -e "const { Keypair } = require('@stellar/stellar-sdk'); const kp = Keypair.random(); console.log(kp.secret())")
fi

# Start weather agent on port 3001
echo "Starting weather agent on :3001..."
npx tsx demo/weather-agent/handler.ts 2>/dev/null &  # preload
node packages/sdk/dist/cli.js serve \
  --skill weather \
  --handler demo/weather-agent/handler.ts \
  --price 0.01 \
  --category weather \
  --description "Real-time weather data for any city worldwide" \
  --port 3001 \
  --secret "$SELLER1_SECRET" \
  --registry "$SERVICE_REGISTRY_CONTRACT" \
  --receipts "$RECEIPT_LEDGER_CONTRACT" \
  --no-register &

PID1=$!
echo "  PID: $PID1"

# Start research agent on port 3002
echo "Starting research agent on :3002..."
node packages/sdk/dist/cli.js serve \
  --skill research \
  --handler demo/research-agent/handler.ts \
  --price 0.05 \
  --category research \
  --description "Wikipedia-powered research summaries on any topic" \
  --port 3002 \
  --secret "$SELLER1_SECRET" \
  --registry "$SERVICE_REGISTRY_CONTRACT" \
  --receipts "$RECEIPT_LEDGER_CONTRACT" \
  --no-register &

PID2=$!
echo "  PID: $PID2"

# Start joke agent on port 3003
echo "Starting joke agent on :3003..."
node packages/sdk/dist/cli.js serve \
  --skill joke \
  --handler demo/joke-agent/handler.ts \
  --price 0.005 \
  --category entertainment \
  --description "Random jokes on demand" \
  --port 3003 \
  --secret "$SELLER1_SECRET" \
  --registry "$SERVICE_REGISTRY_CONTRACT" \
  --receipts "$RECEIPT_LEDGER_CONTRACT" \
  --no-register &

PID3=$!
echo "  PID: $PID3"

echo ""
echo "All agents started! PIDs: $PID1 $PID2 $PID3"
echo "Press Ctrl+C to stop all agents"
echo ""

# Wait for any to exit
wait
