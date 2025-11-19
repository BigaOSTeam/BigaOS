#!/bin/bash

echo "🗺️  Installing OpenSeaMap Dependencies for Boat OS"
echo "=================================================="
echo ""

cd client

echo "📦 Installing Leaflet and React-Leaflet..."
npm install

echo ""
echo "✅ Installation Complete!"
echo ""
echo "📋 Next Steps:"
echo "1. Stop the client dev server (Ctrl+C if running)"
echo "2. Restart: npm run dev"
echo "3. Open browser to http://localhost:5173"
echo "4. Click the '🗺️ Chart' button to see the map!"
echo ""
echo "🚤 Enjoy your nautical charts!"
