#!/bin/bash

# Setup script for LLM-powered arbitrage matching

echo "🧠 SETTING UP LLM ARBITRAGE MATCHING"
echo "======================================="

# Check if GEMINI_API_KEY is set
if [ -z "$GEMINI_API_KEY" ]; then
    echo "❌ GEMINI_API_KEY environment variable not set"
    echo ""
    echo "💡 To get a Gemini API key:"
    echo "   1. Visit: https://makersuite.google.com/app/apikey"
    echo "   2. Create a new API key"
    echo "   3. Set it with: export GEMINI_API_KEY='your-api-key'"
    echo ""
    echo "📋 Example setup commands:"
    echo "   export GEMINI_API_KEY='AIzaSyBOTI02uM-...' # Your actual key"
    echo "   node --import tsx/esm scripts/llm-arbitrage-matching.ts"
    echo ""
    exit 1
fi

echo "✅ GEMINI_API_KEY is set"
echo "🚀 Ready to run LLM arbitrage matching!"
echo ""
echo "Run with:"
echo "   node --import tsx/esm scripts/llm-arbitrage-matching.ts"