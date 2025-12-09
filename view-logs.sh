#!/bin/bash
# Log viewer script that doesn't auto-scroll
# Usage: ./view-logs.sh [combined|error|all] [lines]

LOG_TYPE=${1:-combined}
LINES=${2:-100}

case $LOG_TYPE in
  combined)
    echo "==================================="
    echo "Last $LINES lines of COMBINED LOG"
    echo "==================================="
    tail -n $LINES bot-combined.log
    ;;
  error)
    echo "==================================="
    echo "Last $LINES lines of ERROR LOG"
    echo "==================================="
    tail -n $LINES bot-error.log
    ;;
  all)
    echo "==================================="
    echo "Last $LINES lines of COMBINED LOG"
    echo "==================================="
    tail -n $LINES bot-combined.log
    echo ""
    echo "==================================="
    echo "Last $LINES lines of ERROR LOG"
    echo "==================================="
    tail -n $LINES bot-error.log
    ;;
  *)
    echo "Usage: ./view-logs.sh [combined|error|all] [lines]"
    echo "Examples:"
    echo "  ./view-logs.sh combined 50    # View last 50 lines of combined log"
    echo "  ./view-logs.sh error 100      # View last 100 lines of error log"
    echo "  ./view-logs.sh all 200        # View last 200 lines of both logs"
    exit 1
    ;;
esac

echo ""
echo "Press 'q' to exit less, or scroll with arrow keys"

