# 🎬 Sora Video Downloader

A Chrome extension built with Plasmo that allows you to easily download videos and thumbnails from Sora video pages.

## Features

- 🔍 **Automatic Media Extraction**: Automatically scans Sora video pages for videos and thumbnails
- 📥 **One-Click Download**: Download individual files or all media at once
- 🎥 **Video Support**: Supports MP4, WebM, MOV, AVI formats
- 🖼️ **Thumbnail Support**: Supports JPG, JPEG, PNG, WebP formats
- 🎨 **Modern UI**: Clean and intuitive interface
- ⚡ **Fast & Reliable**: Efficient extraction using multiple methods

## Installation

1. Clone this repository
2. Install dependencies:
   ```bash
   pnpm install
   ```
3. Build the extension:
   ```bash
   pnpm build
   ```
4. Load the extension in Chrome:
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" and select the `build/chrome-mv3-prod` folder

## Usage

1. Navigate to any Sora video page (e.g., `https://sora.chatgpt.com/p/s_68e37ae44a548191a2da126fe20c19d9`)
2. Click the extension icon in your browser toolbar
3. The extension will automatically extract media from the page
4. Click individual download buttons or use "Download All" to save everything

## How It Works

The extension uses multiple extraction methods to find media:

- **DOM Analysis**: Scans for `<video>` and `<img>` elements
- **Script Parsing**: Extracts URLs from JavaScript variables and JSON data
- **Content Scanning**: Searches page content for direct media URLs
- **Smart Filtering**: Identifies thumbnails vs regular images using keywords

## Development

```bash
# Start development server
pnpm dev

# Build for production
pnpm build

# Package for distribution
pnpm package
```

## Technical Details

- Built with [Plasmo](https://www.plasmo.com/) framework
- Uses TypeScript for type safety
- React-based popup interface
- Content script for page analysis
- Chrome Extension Manifest V3

## Permissions

- `activeTab`: Access to the current tab
- `downloads`: Download files to user's device
- `tabs`: Query tab information
- `host_permissions`: Access to Sora and other websites

## License

MIT License
