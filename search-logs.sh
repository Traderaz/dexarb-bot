#!/bin/bash
# Search logs for specific patterns
# Usage: ./search-logs.sh "search term" [lines of context]

SEARCH_TERM=$1
CONTEXT=${2:-3}

if [ -z "$SEARCH_TERM" ]; then
  echo "Usage: ./search-logs.sh \"search term\" [lines of context]"
  echo ""
  echo "Examples:"
  echo "  ./search-logs.sh \"ENTRY\"            # Find all entries"
  echo "  ./search-logs.sh \"ERROR\" 5         # Find errors with 5 lines context"
  echo "  ./search-logs.sh \"Position OPENED\"  # Find all position opens"
  exit 1
fi

echo "==================================="
echo "Searching for: $SEARCH_TERM"
echo "Context lines: $CONTEXT"
echo "==================================="
echo ""

echo "--- COMBINED LOG ---"
grep -i -C $CONTEXT "$SEARCH_TERM" bot-combined.log | tail -n 100

echo ""
echo "--- ERROR LOG ---"
grep -i -C $CONTEXT "$SEARCH_TERM" bot-error.log | tail -n 100

echo ""
echo "==================================="
echo "Search complete"
echo "==================================="

