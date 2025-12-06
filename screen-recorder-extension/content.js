// Content script for area selection

let isSelectingArea = false;
let selectionStart = null;
let selectionBox = null;

// Create selection overlay
function createSelectionOverlay() {
  const overlay = document.createElement('div');
  overlay.id = 'screen-recorder-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.3);
    z-index: 999999;
    cursor: crosshair;
    pointer-events: auto;
  `;
  document.body.appendChild(overlay);
  return overlay;
}

// Create selection box
function createSelectionBox() {
  const box = document.createElement('div');
  box.id = 'screen-recorder-selection';
  box.style.cssText = `
    position: fixed;
    border: 2px dashed #4CAF50;
    background: rgba(76, 175, 80, 0.1);
    pointer-events: none;
    z-index: 1000000;
    display: none;
  `;
  document.body.appendChild(box);
  return box;
}

// Start area selection
function startAreaSelection() {
  if (isSelectingArea) {
    stopAreaSelection(); // Reset if already selecting
  }
  
  isSelectingArea = true;
  
  // Wait for DOM to be ready
  if (document.body) {
    const overlay = createSelectionOverlay();
    selectionBox = createSelectionBox();
    setupSelectionHandlers(overlay, selectionBox);
  } else {
    // Wait for body to load
    const observer = new MutationObserver(() => {
      if (document.body) {
        observer.disconnect();
        const overlay = createSelectionOverlay();
        selectionBox = createSelectionBox();
        setupSelectionHandlers(overlay, selectionBox);
      }
    });
    observer.observe(document.documentElement, { childList: true });
  }
}

// Setup selection handlers
function setupSelectionHandlers(overlay, selectionBox) {
  
  overlay.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    selectionStart = { x: e.clientX, y: e.clientY };
    selectionBox.style.display = 'block';
    selectionBox.style.left = e.clientX + 'px';
    selectionBox.style.top = e.clientY + 'px';
    selectionBox.style.width = '0px';
    selectionBox.style.height = '0px';
  });
  
  overlay.addEventListener('mousemove', (e) => {
    if (!selectionStart) return;
    
    const width = Math.abs(e.clientX - selectionStart.x);
    const height = Math.abs(e.clientY - selectionStart.y);
    const left = Math.min(e.clientX, selectionStart.x);
    const top = Math.min(e.clientY, selectionStart.y);
    
    selectionBox.style.left = left + 'px';
    selectionBox.style.top = top + 'px';
    selectionBox.style.width = width + 'px';
    selectionBox.style.height = height + 'px';
  });
  
  overlay.addEventListener('mouseup', (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!selectionStart) {
      stopAreaSelection();
      return;
    }
    
    const width = Math.abs(e.clientX - selectionStart.x);
    const height = Math.abs(e.clientY - selectionStart.y);
    const left = Math.min(e.clientX, selectionStart.x);
    const top = Math.min(e.clientY, selectionStart.y);
    
    if (width > 10 && height > 10) {
      const area = {
        x: left,
        y: top,
        width: width,
        height: height
      };
      
      // Send area to popup via background
      chrome.runtime.sendMessage({
        action: 'areaSelected',
        area: area
      }).catch(err => {
        console.error('Failed to send area:', err);
      });
    }
    
    // Cleanup
    stopAreaSelection();
  });
  
  // Cancel on Escape
  const escapeHandler = (e) => {
    if (e.key === 'Escape') {
      stopAreaSelection();
      document.removeEventListener('keydown', escapeHandler);
    }
  };
  document.addEventListener('keydown', escapeHandler);
}

// Stop area selection
function stopAreaSelection() {
  isSelectingArea = false;
  selectionStart = null;
  
  const overlay = document.getElementById('screen-recorder-overlay');
  const box = document.getElementById('screen-recorder-selection');
  
  if (overlay) overlay.remove();
  if (box) box.remove();
}

// Message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'startAreaSelection') {
    startAreaSelection();
    sendResponse({ success: true });
  }
  return true;
});

