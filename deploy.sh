#!/bin/bash
# Vercel Deployment Script
# This script helps you deploy the Crypto Compliance Framework to Vercel

set -e

echo "🚀 Crypto Compliance Framework - Vercel Deployment Script"
echo "=========================================================="
echo ""

# Check if Vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "❌ Vercel CLI is not installed."
    echo ""
    echo "Please install it with:"
    echo "  npm install -g vercel"
    echo ""
    echo "Or use yarn:"
    echo "  yarn global add vercel"
    echo ""
    exit 1
fi

echo "✅ Vercel CLI is installed"
echo ""

# Check if user is logged in
echo "🔐 Checking Vercel authentication..."
if ! vercel whoami &> /dev/null; then
    echo "❌ You are not logged in to Vercel."
    echo ""
    echo "Please login with:"
    echo "  vercel login"
    echo ""
    exit 1
fi

VERCEL_USER=$(vercel whoami)
echo "✅ Logged in as: $VERCEL_USER"
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ package.json not found. Are you in the project root?"
    exit 1
fi

echo "📦 Project: $(grep -o '"name": "[^"]*' package.json | cut -d'"' -f4)"
echo ""

# Ask for deployment type
echo "Select deployment type:"
echo "  1) Production (--prod)"
echo "  2) Preview (default)"
read -p "Enter choice (1 or 2): " DEPLOY_TYPE

if [ "$DEPLOY_TYPE" = "1" ]; then
    DEPLOY_FLAG="--prod"
    echo "🎯 Deploying to PRODUCTION"
else
    DEPLOY_FLAG=""
    echo "🎯 Deploying to PREVIEW"
fi
echo ""

# Get commit metadata
COMMIT_SHA=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
COMMIT_TIME=$(git show -s --format=%cI HEAD 2>/dev/null || echo "unknown")

echo "📝 Build Metadata:"
echo "   Commit SHA: $COMMIT_SHA"
echo "   Commit Time: $COMMIT_TIME"
echo ""

# Ask for confirmation
read -p "🚀 Ready to deploy. Continue? (y/N): " CONFIRM
if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
    echo "❌ Deployment cancelled"
    exit 0
fi

echo ""
echo "🔨 Starting deployment..."
echo ""

# Deploy with metadata
vercel $DEPLOY_FLAG \
  -b CCF_COMMIT_SHA="$COMMIT_SHA" \
  -b CCF_COMMIT_TIME="$COMMIT_TIME"

DEPLOY_STATUS=$?

echo ""
if [ $DEPLOY_STATUS -eq 0 ]; then
    echo "✅ Deployment successful!"
    echo ""
    echo "📋 Post-deployment checklist:"
    echo "   1. Visit your deployment URL"
    echo "   2. Check /robots.txt"
    echo "   3. Check /sitemap.xml"
    echo "   4. Check /machine-interface/canonical-definitions.json"
    echo "   5. Test a framework entry page"
    echo ""
else
    echo "❌ Deployment failed with exit code $DEPLOY_STATUS"
    exit $DEPLOY_STATUS
fi
