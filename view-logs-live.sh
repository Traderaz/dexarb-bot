#!/bin/bash
# Live log viewer with PAUSE capability
# Usage: ./view-logs-live.sh [combined|error]

LOG_TYPE=${1:-combined}

case $LOG_TYPE in
  combined)
    LOG_FILE="bot-combined.log"
    ;;
  error)
    LOG_FILE="bot-error.log"
    ;;
  *)
    echo "Usage: ./view-logs-live.sh [combined|error]"
    exit 1
    ;;
esac

echo "==================================="
echo "Viewing: $LOG_FILE (LIVE)"
echo "==================================="
echo "Controls:"
echo "  Ctrl+S = PAUSE scrolling"
echo "  Ctrl+Q = RESUME scrolling"
echo "  Ctrl+C = EXIT"
echo "==================================="
echo ""

# Use less with follow mode - allows scrolling and pausing
tail -f $LOG_FILE | less +F

