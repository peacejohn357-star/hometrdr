// Offscreen document script for clipboard operations
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'offscreen:copy') {
    const text = message.text;
    const textarea = document.getElementById('clipboard-textarea');
    textarea.value = text;
    textarea.select();
    try {
      const successful = document.execCommand('copy');
      sendResponse({ success: successful });
    } catch (err) {
      console.error('Offscreen clipboard copy failed:', err);
      sendResponse({ success: false, error: err.message });
    }
    return true;
  }
});
