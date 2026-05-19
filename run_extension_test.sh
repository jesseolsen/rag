#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Chrome Extension E2E Test Automation${NC}\n"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js not found. Install with: brew install node${NC}"
    exit 1
fi

# Check if Playwright is installed
if ! npm list playwright &> /dev/null; then
    echo -e "${YELLOW}📦 Installing Playwright...${NC}"
    npm install playwright
fi

# Check if backend is running
echo -e "${BLUE}📡 Checking backend...${NC}"
if ! curl -s http://localhost:8000/health > /dev/null 2>&1; then
    echo -e "${RED}❌ Backend not running${NC}"
    echo -e "${YELLOW}   Start with: uvicorn app.main:app --reload${NC}"
    read -p "Press Enter to continue anyway, or Ctrl+C to stop..."
fi

echo -e "${GREEN}✓ Backend is running${NC}\n"

# Run the E2E test
echo -e "${BLUE}🧪 Running E2E test...${NC}\n"
node test_extension_e2e.js

# Show results
echo -e "\n${GREEN}✅ Test complete!${NC}"
echo -e "${BLUE}📸 Screenshot saved to: extension_test_result.png${NC}"
echo -e "${BLUE}📊 Check console output above for results${NC}\n"

# Open screenshot if it exists
if [ -f "extension_test_result.png" ]; then
    echo -e "${YELLOW}Opening screenshot...${NC}"
    open extension_test_result.png
fi
