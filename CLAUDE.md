# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Chrome browser extension built with the Plasmo framework for downloading videos and thumbnails from Sora (OpenAI's video generation platform). The extension uses content scripts to extract media URLs from Sora pages and provides a popup interface for downloading the content.

## Commands

```bash
# Install dependencies
pnpm install

# Start development server with hot reload
pnpm dev

# Build extension for production
pnpm build

# Package extension for distribution
pnpm package
```

## Architecture

### Core Components

- **popup.tsx**: Main React component that renders the extension popup interface
- **contents/sora-extractor.ts**: Content script that injects into Sora pages to extract media URLs

### Key Files Structure

```
├── popup.tsx                 # Main popup UI component
├── contents/sora-extractor.ts # Content script for media extraction
├── package.json              # Project configuration and scripts
├── README.md                # Project documentation
└── build/                   # Generated build output
```

### How It Works

1. **Content Script Injection**: `sora-extractor.ts` runs on `https://sora.chatgpt.com/*` pages
2. **Media Extraction**: Uses multiple methods to find video and thumbnail URLs:
   - DOM analysis of `<video>` and `<img>` elements
   - Script parsing for JSON data containing URLs
   - Content scanning for direct media URLs
   - Smart filtering to prioritize signed URLs from OpenAI
3. **Popup Communication**: Popup sends messages to content script to trigger extraction
4. **Download Functionality**: Uses Chrome's downloads API to save files locally

### Important Technical Details

- **URL Validation**: Prioritizes signed URLs from OpenAI (those with `sig`, `st`, `se`, `sv` parameters)
- **Duplicate Removal**: Removes duplicates while keeping higher-priority signed URLs
- **Error Handling**: Comprehensive error handling for extraction and download failures
- **Auto-extraction**: Automatically extracts media when popup opens on Sora pages

### Permissions

The extension requires:
- `activeTab`: Access to current tab content
- `downloads`: File download capabilities
- `tabs`: Tab information querying
- Host permissions for `sora.chatgpt.com` and all websites

### Development Notes

- Built with TypeScript and React
- Uses Plasmo framework for Chrome Extension Manifest V3
- Supports common video formats (MP4, WebM, MOV, AVI) and image formats (JPG, PNG, WebP)
- Content script waits 2 seconds after page load for dynamic content
- Popup dimensions: 450px width, 600px max height