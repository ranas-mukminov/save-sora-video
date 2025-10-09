#!/bin/bash

# Simple server launcher for screenshot-canvas.html

echo "🚀 Starting local server for screenshot canvas..."
echo ""
echo "Choose a server option:"
echo "1) Python 3 (recommended)"
echo "2) Python 2"
echo "3) Node.js"
echo "4) PHP"
echo ""

read -p "Enter your choice (1-4): " choice

case $choice in
    1)
        if command -v python3 &> /dev/null; then
            echo "Starting Python 3 server on port 8000..."
            echo "Open http://localhost:8000/screenshot-canvas.html"
            python3 -m http.server 8000
        else
            echo "Python 3 not found. Please install Python 3."
        fi
        ;;
    2)
        if command -v python &> /dev/null; then
            echo "Starting Python 2 server on port 8000..."
            echo "Open http://localhost:8000/screenshot-canvas.html"
            python -m SimpleHTTPServer 8000
        else
            echo "Python not found. Please install Python."
        fi
        ;;
    3)
        if command -v npx &> /dev/null; then
            echo "Starting Node.js server..."
            echo "Open http://localhost:3000/screenshot-canvas.html"
            npx serve .
        else
            echo "Node.js/npx not found. Please install Node.js."
        fi
        ;;
    4)
        if command -v php &> /dev/null; then
            echo "Starting PHP server on port 8000..."
            echo "Open http://localhost:8000/screenshot-canvas.html"
            php -S localhost:8000
        else
            echo "PHP not found. Please install PHP."
        fi
        ;;
    *)
        echo "Invalid choice. Please run the script again."
        ;;
esac