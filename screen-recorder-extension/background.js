// Background service worker - handles messages between content script and popup

// Forward area selection from content script to popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'areaSelected') {
    // Forward to popup if it's listening
    chrome.runtime.sendMessage(message).catch(() => {
      // Popup might not be open, that's okay
    });
    sendResponse({ success: true });
  }
  
  return true;
});
