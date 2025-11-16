/**
 * Screenshot Canvas Display Script
 * Secure implementation with proper path validation
 */

// Security: Whitelist of allowed screenshot files
const SCREENSHOT_DIR = 'screenshots/';
const ALLOWED_FILES = ['1.png', '2.png'];

let currentImage = null;

/**
 * Validate screenshot path against whitelist
 * Prevents path traversal attacks
 */
function isAllowedScreenshot(path) {
    if (!path || typeof path !== 'string') {
        return false;
    }

    // Normalize path (remove leading ./)
    const normalized = path.replace(/^\.\//, '');

    // Must start with screenshots directory
    if (!normalized.startsWith(SCREENSHOT_DIR)) {
        return false;
    }

    // Extract filename
    const filename = normalized.substring(SCREENSHOT_DIR.length);

    // Check against whitelist
    return ALLOWED_FILES.includes(filename);
}

/**
 * Load selected screenshot image
 */
function loadSelectedImage() {
    const select = document.getElementById('imageSelect');
    const loadingMessage = document.getElementById('loadingMessage');

    if (!(select instanceof HTMLSelectElement) || !(loadingMessage instanceof HTMLElement)) {
        console.error('Required DOM elements were not found.');
        return;
    }

    const imagePath = select.value;

    if (!imagePath) {
        return;
    }

    // Validate against whitelist
    if (!isAllowedScreenshot(imagePath)) {
        loadingMessage.textContent = 'Invalid image selected.';
        loadingMessage.style.display = 'block';
        setTimeout(() => {
            loadingMessage.style.display = 'none';
            loadingMessage.textContent = 'Loading image...';
            select.value = '';
        }, 3000);
        return;
    }

    loadingMessage.style.display = 'block';

    const img = new Image();
    img.onload = function() {
        currentImage = img;
        updateCanvas(1280);
        updateCanvas(640);
        loadingMessage.style.display = 'none';
    };
    img.onerror = function() {
        loadingMessage.textContent = 'Error loading image. Please run local server or check file path.';
        setTimeout(() => {
            loadingMessage.style.display = 'none';
            loadingMessage.textContent = 'Loading image...';
        }, 3000);
    };
    img.src = imagePath;
}

/**
 * Update canvas with current image and background color
 */
function updateCanvas(size) {
    if (!currentImage) {
        alert('Please select and load a screenshot first!');
        return;
    }

    const canvas = document.getElementById(`canvas${size}`);
    const bgColorInput = document.getElementById(`bgColor${size}`);

    if (!(canvas instanceof HTMLCanvasElement) || !(bgColorInput instanceof HTMLInputElement)) {
        alert('Canvas configuration is missing.');
        return;
    }

    const ctx = canvas.getContext('2d');

    if (!ctx) {
        alert('Unable to access canvas rendering context.');
        return;
    }

    const bgColor = bgColorInput.value;

    // Clear canvas and set background
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, size, size === 1280 ? 800 : 400);

    // Calculate scaling to fit image in canvas
    const canvasWidth = size;
    const canvasHeight = size === 1280 ? 800 : 400;

    const imgAspect = currentImage.width / currentImage.height;
    const canvasAspect = canvasWidth / canvasHeight;

    let drawWidth, drawHeight, offsetX, offsetY;

    if (imgAspect > canvasAspect) {
        // Image is wider than canvas aspect ratio
        drawWidth = canvasWidth * 0.9;
        drawHeight = drawWidth / imgAspect;
        offsetX = (canvasWidth - drawWidth) / 2;
        offsetY = (canvasHeight - drawHeight) / 2;
    } else {
        // Image is taller than canvas aspect ratio
        drawHeight = canvasHeight * 0.9;
        drawWidth = drawHeight * imgAspect;
        offsetX = (canvasWidth - drawWidth) / 2;
        offsetY = (canvasHeight - drawHeight) / 2;
    }

    // Add subtle shadow effect
    ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 10;

    // Draw the image
    ctx.drawImage(currentImage, offsetX, offsetY, drawWidth, drawHeight);

    // Reset shadow
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
}

/**
 * Save canvas as PNG file
 */
function saveCanvas(size, buttonElement) {
    const canvas = document.getElementById(`canvas${size}`);

    if (!(canvas instanceof HTMLCanvasElement)) {
        alert('Canvas element not found.');
        return;
    }

    const triggerButton = buttonElement instanceof HTMLButtonElement ? buttonElement : null;

    try {
        // Try to export directly first
        canvas.toBlob(function(blob) {
            if (blob) {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `screenshot-${size}x${size === 1280 ? 800 : 400}.png`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

                // Show success message
                if (triggerButton) {
                    const originalText = triggerButton.textContent;
                    triggerButton.textContent = 'Saved!';
                    triggerButton.style.background = 'linear-gradient(135deg, #48bb78, #38a169)';
                    setTimeout(() => {
                        triggerButton.textContent = originalText;
                        triggerButton.style.background = '';
                    }, 2000);
                }
            } else {
                throw new Error('Canvas export failed');
            }
        }, 'image/png');
    } catch (error) {
        // Fallback: show server instructions
        alert('Canvas export failed due to CORS restrictions.\n\nPlease run a local server:\n\nMethod 1: Using Docker\n./start-server.sh\n\nMethod 2: Using Python\npython -m http.server 8080\n\nThen open http://localhost:8080/screenshot-canvas.html');
    }
}

// Initialize on page load
window.addEventListener('load', function() {
    // Auto-select the first image
    const select = document.getElementById('imageSelect');
    if (select) {
        select.value = 'screenshots/1.png';
        loadSelectedImage();
    }
});

// Add keyboard shortcuts
document.addEventListener('keydown', function(e) {
    if (e.ctrlKey || e.metaKey) {
        switch(e.key) {
            case '1':
                e.preventDefault();
                saveCanvas(1280);
                break;
            case '2':
                e.preventDefault();
                saveCanvas(640);
                break;
            case 'u':
                e.preventDefault();
                updateCanvas(1280);
                updateCanvas(640);
                break;
        }
    }
});
