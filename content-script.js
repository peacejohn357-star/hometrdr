// ============================================================================
// TRADEVISION AI - LIGHTWEIGHT CONTENT BRIDGE WINDOW FOR TRADINGVIEW
// ============================================================================
console.log('TradeVision AI: Content injection pipeline verified on active chart DOM workspace canvas.');

/**
 * Robust runtime messaging listener interface
 * Handles incoming instruction dispatches from background.js
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== 'object') return false;

  console.log('TradeVision AI [Content]: Intercepted runtime request action:', message.action);

  switch (message.action) {
    case 'ping':
      // Basic heartbeat handshake verification check to confirm injection health
      sendResponse({ success: true, ready: true });
      break;

    case 'getHistoricalMarketData':
      // Dynamically scrape active asset information directly from TradingView webpage properties
      try {
        const symbolTicker = document.title ? document.title.split(' ')[0] : 'Unknown';

        // Assemble current market state framework to inject into our prompt synthesis matrix
        const capturedMarketState = {
          ticker: symbolTicker,
          extractedAt: Date.now(),
          clientViewport: {
            width: window.innerWidth,
            height: window.innerHeight
          },
          note: "Market data payload array ready for dynamic visual synthesis processing."
        };

        sendResponse({ success: true, data: capturedMarketState });
      } catch (error) {
        console.error('TradeVision AI [Content]: Failed gathering current tab DOM elements:', error);
        sendResponse({ success: false, data: null, error: error.message });
      }
      break;

    case 'hidePanel':
      // Placeholder actions for when the background worker requests frame manipulation
      console.log('TradeVision AI [Content]: Pre-screenshot frame optimization phase triggered.');
      sendResponse({ success: true });
      break;

    case 'showPanel':
      console.log('TradeVision AI [Content]: Post-screenshot interface rendering sequence resumed.');
      sendResponse({ success: true });
      break;

    case 'togglePanel':
      console.log('TradeVision AI [Content]: Toggling Sidebar Panel UI.');
      // Simple implementation of toggle - in a real app this would inject/remove a sidebar element
      const existingPanel = document.getElementById('tradevision-sidebar-panel');
      if (existingPanel) {
        existingPanel.remove();
        console.log('TradeVision AI [Content]: Panel removed.');
      } else {
        const panel = document.createElement('div');
        panel.id = 'tradevision-sidebar-panel';
        panel.style.cssText = 'position:fixed; top:0; right:0; width:300px; height:100%; background:white; z-index:9999; border-left:1px solid #ccc; padding:10px; box-shadow:-2px 0 5px rgba(0,0,0,0.1);';
        panel.innerHTML = '<h3>TradeVision AI Terminal</h3><p>Analysis ready. Click the extension icon again to close.</p>';
        document.body.appendChild(panel);
        console.log('TradeVision AI [Content]: Panel injected.');
      }
      sendResponse({ success: true });
      break;

    default:
      sendResponse({ success: false, error: 'Unhandled content framework pipeline message routing instruction action.' });
      break;
  }

  return true; // Keep message channel handshake link state open for asynchronous callbacks
});
