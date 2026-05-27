/**
 * @license
 * Copyright (c) 2024 CRX Universal LLC. All Rights Reserved.
 *
 * This code is licensed under a commercial license.
 * See the LICENSE.md file for details.
 */

// Background Service Worker for TradeVision AI v1.4.8

// Import utilities with proper error handling
importScripts('constants.js');
importScripts('storage-utils.js');

try {
    console.log('TradeVision AI: All utilities loaded successfully');
} catch (error) {
    console.error('TradeVision AI: Failed to load utilities:', error);
    // Create fallback constants if import fails
    if (typeof self.REVIEW_MILESTONES === 'undefined') {
        self.REVIEW_MILESTONES = [3, 15, 30, 50];
        self.REVIEW_INTERVAL_AFTER_MILESTONES = 20;
        self.getNextReviewMilestone = function(count) {
            for (const milestone of self.REVIEW_MILESTONES) {
                if (count < milestone) return milestone;
            }
            const last = self.REVIEW_MILESTONES[self.REVIEW_MILESTONES.length - 1];
            const after = count - last;
            const intervals = Math.floor(after / self.REVIEW_INTERVAL_AFTER_MILESTONES);
            return last + ((intervals + 1) * self.REVIEW_INTERVAL_AFTER_MILESTONES);
        };
        self.isReviewMilestone = function(count) {
            return self.REVIEW_MILESTONES.includes(count);
        };
        console.warn('TradeVision AI: Using fallback constants');
    }
}

function cleanMarkdownForPreview(text) {
    return text
        .replace(/^SYMBOL:.*$/gm, '')  // Remove SYMBOL lines
        .replace(/^TIMEFRAME:.*$/gm, '')  // Remove TIMEFRAME lines
        .replace(/^---.*---$/gm, '')  // Remove separator lines
        .replace(/^#{1,6}\s*.*$/gm, '')  // Remove headers
        .replace(/\*\*(.*?)\*\*/g, '$1')  // Remove bold markers
        .replace(/\*(.*?)\*/g, '$1')  // Remove italic markers
        .replace(/`(.*?)`/g, '$1')  // Remove code markers
        .replace(/\n{3,}/g, ' ')  // Replace multiple newlines with spaces
        .replace(/\n/g, ' ')  // Replace single newlines with spaces
        .replace(/\s{2,}/g, ' ')  // Collapse multiple spaces
        .trim()
        .substring(0, 200) + '...'; // Take more content for better preview
}

// --- 1. EVENT LISTENERS ---

// On extension installation, set up the context menu
chrome.runtime.onInstalled.addListener(async (details) => {
    // Set up context menu
    chrome.contextMenus.create({
        id: 'tradevision-toggle-panel',
        title: 'Toggle TradeVision AI Panel',
        contexts: ['page'],
        documentUrlPatterns: ['*://*.tradingview.com/chart/*']
    });

    console.log('TradeVision AI: Extension installation routing active. Interface file hooks bypassed.');
    // Bypassed the missing options page html redirect loops entirely
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === 'tradevision-toggle-panel') {
        await sendMessageToTabWithRetry(tab.id, { action: 'togglePanel' }, true);
    }
});

// On extension icon click, toggle the panel.
chrome.action.onClicked.addListener(async (tab) => {
    const activeTab = await chrome.tabs.get(tab.id);
    console.log('TradeVision AI: Action clicked on tab:', activeTab.id, 'URL:', activeTab.url);

    if (!activeTab.url || !activeTab.url.includes('tradingview.com')) {
        console.error('TradeVision AI: Not a TradingView page');
        return;
    }

    const result = await sendMessageToTabWithRetry(activeTab.id, { action: 'togglePanel' }, true);
    if (!result.success) {
        // If all retries fail, notify the user
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'images/icon128.png',
            title: 'TradeVision AI',
            message: 'Panel could not be opened. Please refresh the TradingView page and try again.'
        });
    }
});

// Listen for messages from other parts of the extension with improved validation
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Validate message structure
    if (!message || typeof message !== 'object') {
        console.error('TradeVision AI: Invalid message received:', message);
        sendResponse({ success: false, error: 'Invalid message format' });
        return false;
    }

    if (!message.action) {
        console.error('TradeVision AI: Message missing action property:', message);
        sendResponse({ success: false, error: 'Message missing action property' });
        return false;
    }

    console.log('TradeVision AI: Received message:', message.action, 'from:', sender.tab?.id);

    switch (message.action) {
        case 'analyzeChartFromPanel':
            handleAnalysis(sender.tab).then(sendResponse).catch(error => {
                console.error('TradeVision AI: Analysis error:', error);
                sendResponse({ success: false, error: error.message });
            });
            return true; // Keep channel open for async response

        case 'copyToClipboard':
            (async () => {
                try {
                    await ensureOffscreenClipboard();
                    const result = await sendCopyToOffscreen(message.text || '');
                    sendResponse(result);
                } catch (e) {
                    console.error('TradeVision AI: Clipboard error:', e);
                    sendResponse({ success: false, error: e?.message || 'Clipboard failed' });
                }
            })();
            return true; // Keep channel open

        case 'ping':
            // Health check - respond immediately
            sendResponse({ success: true, ready: true });
            return false; // No need to keep channel open

        case 'getReviewTracking':
            // Handle review tracking requests from content script
            console.log('TradeVision AI: Background received getReviewTracking message');
            self.tradeVisionStorage.getReviewTracking().then(tracking => {
                try {
                    // Augment modern tracking with legacy-compatible fields expected by content script
                    const legacy = {
                        // Map modern fields into legacy shape used by content script
                        pendingReviewPrompt: !!tracking.pendingReviewPrompt,
                        pendingReviewCount: (function() {
                            // Derive a friendly bucket for the content UI using configured REVIEW_MILESTONES
                            const count = tracking.currentReviewMilestone || tracking.nextReviewMilestone || tracking.analysisCount || 0;
                            if (typeof REVIEW_MILESTONES !== 'undefined' && REVIEW_MILESTONES.length >= 3) {
                                if (count >= REVIEW_MILESTONES[2]) return REVIEW_MILESTONES[2];
                                if (count >= REVIEW_MILESTONES[1]) return REVIEW_MILESTONES[1];
                                if (count >= REVIEW_MILESTONES[0]) return REVIEW_MILESTONES[0];
                            }
                            // Fallback buckets
                            if (count >= 25) return 25;
                            if (count >= 10) return 10;
                            if (count >= 1) return 1;
                            return count;
                        })(),
                        pendingReviewType: (tracking.currentReviewMilestone && (typeof REVIEW_MILESTONES !== 'undefined' ? tracking.currentReviewMilestone >= REVIEW_MILESTONES[1] : tracking.currentReviewMilestone >= 10)) ? 'advanced' : 'initial',
                        promptShownCount: tracking.reviewPromptShownCount || 0,
                        lastPromptShown: tracking.lastReviewPromptShown || null,
                        hasSeenReviewPrompt: !!tracking.reviewClicked
                    };

                    const combined = { ...tracking, ...legacy };
                    console.log('TradeVision AI: Background sending review tracking data (augmented):', combined);
                    sendResponse(combined);
                } catch (e) {
                    console.error('TradeVision AI: Error augmenting tracking data:', e);
                    sendResponse(tracking);
                }
            }).catch(error => {
                console.error('TradeVision AI: Error getting review tracking:', error);
                const fallbackTracking = {
                    analysisCount: 0,
                    hasSeenReviewPrompt: false,
                    reviewReminderCount: null,
                    reviewReminderDate: null,
                    pendingReviewPrompt: false,
                    pendingReviewType: null,
                    pendingReviewCount: 0,
                    lastPromptShown: null,
                    promptShownCount: 0
                };
                console.log('TradeVision AI: Background sending fallback tracking data:', fallbackTracking);
                sendResponse(fallbackTracking);
            });
            return true; // Keep channel open for async response

        case 'saveReviewTracking':
            // Handle review tracking save requests from content script
            console.log('TradeVision AI: Background received saveReviewTracking message:', message.data);
            if (message.data) {
                self.tradeVisionStorage.saveReviewTracking(message.data).then(() => {
                    console.log('TradeVision AI: Background successfully saved review tracking');
                    sendResponse({ success: true });
                }).catch(error => {
                    console.error('TradeVision AI: Error saving review tracking:', error);
                    sendResponse({ success: false, error: error.message });
                });
            } else {
                console.error('TradeVision AI: No data provided for saveReviewTracking');
                sendResponse({ success: false, error: 'No data provided' });
            }
            return true; // Keep channel open for async response

        case 'saveWaitlistTracking':
            // Handle waitlist tracking save requests from content script
            console.log('TradeVision AI: Background received saveWaitlistTracking message:', message.data);
            if (message.data) {
                self.tradeVisionStorage.saveWaitlistTracking(message.data).then(() => {
                    console.log('TradeVision AI: Background successfully saved waitlist tracking');
                    sendResponse({ success: true });
                }).catch(error => {
                    console.error('TradeVision AI: Error saving waitlist tracking:', error);
                    sendResponse({ success: false, error: error.message });
                });
            } else {
                console.error('TradeVision AI: No data provided for saveWaitlistTracking');
                sendResponse({ success: false, error: 'No data provided' });
            }
            return true; // Keep channel open for async response

        case 'openUrl':
            // Open a URL in a new tab on behalf of content/panel scripts
            console.log('TradeVision AI: Background received openUrl message:', message.url);
            try {
                if (!message.url || typeof message.url !== 'string') {
                    sendResponse({ success: false, error: 'Invalid url' });
                    return true;
                }
                chrome.tabs.create({ url: message.url }, (tab) => {
                    if (chrome.runtime.lastError) {
                        console.error('TradeVision AI: Error opening URL:', chrome.runtime.lastError);
                        sendResponse({ success: false, error: chrome.runtime.lastError.message });
                    } else {
                        sendResponse({ success: true, tabId: tab?.id });
                    }
                });
            } catch (e) {
                console.error('TradeVision AI: Exception handling openUrl:', e);
                sendResponse({ success: false, error: e?.message || 'openUrl failed' });
            }
            return true;

        default:
            console.warn('TradeVision AI: Unknown message action:', message.action);
            sendResponse({ success: false, error: 'Unknown action' });
            return false;
    }
});

// Robust JSON parsing function with comprehensive error handling
function parseAIResponse(responseText) {
    console.log('TradeVision AI: Starting JSON parsing for response');

    // Default fallback result
    const fallbackResult = {
        analysis: responseText,
        symbol: 'Unknown',
        timeframe: 'Unknown',
        summary: '',
        parsedSuccessfully: false
    };

    if (!responseText || typeof responseText !== 'string') {
        console.error('TradeVision AI: Invalid response text provided');
        return fallbackResult;
    }

    // Clean the response text first
    const cleanedText = responseText.trim();

    // Strategy 1: Try to extract and parse JSON from markdown code blocks
    const jsonFromCodeBlocks = extractJsonFromCodeBlocks(cleanedText);
    if (jsonFromCodeBlocks) {
        console.log('TradeVision AI: Successfully parsed JSON from code blocks');
        return { ...jsonFromCodeBlocks, parsedSuccessfully: true };
    }

    // Strategy 2: Try direct JSON parsing
    const directJson = parseDirectJson(cleanedText);
    if (directJson) {
        console.log('TradeVision AI: Successfully parsed direct JSON');
        return { ...directJson, parsedSuccessfully: true };
    }

    // Strategy 3: Try to find JSON object in text
    const jsonFromText = extractJsonFromText(cleanedText);
    if (jsonFromText) {
        console.log('TradeVision AI: Successfully extracted JSON from text');
        return { ...jsonFromText, parsedSuccessfully: true };
    }

    // Strategy 4: Fallback to regex extraction for backward compatibility
    console.log('TradeVision AI: Using fallback regex extraction');
    const fallbackAnalysis = extractAnalysisTextFromResponse(cleanedText);
    const summary = fallbackAnalysis.substring(0, 100) + '...';

    return {
        analysis: fallbackAnalysis,
        symbol: 'Unknown',
        timeframe: 'Unknown',
        summary: summary,
        parsedSuccessfully: false
    };
}

// Extract JSON from markdown code blocks
function extractJsonFromCodeBlocks(text) {
    const codeBlockPatterns = [
        /```json\s*([\s\S]*?)\s*```/,
        /```\s*([\s\S]*?)\s*```/,
        /`([^`]*)`/ // Inline code
    ];

    for (const pattern of codeBlockPatterns) {
        const match = text.match(pattern);
        if (match) {
            try {
                const jsonText = match[1].trim();
                const parsed = JSON.parse(jsonText);
                return validateParsedData(parsed);
            } catch (e) {
                console.log('TradeVision AI: Failed to parse code block JSON:', e.message);
                continue;
            }
        }
    }
    return null;
}

// Parse direct JSON response
function parseDirectJson(text) {
    try {
        // Check if it looks like a JSON object
        if (text.startsWith('{') && text.endsWith('}')) {
            const parsed = JSON.parse(text);
            return validateParsedData(parsed);
        }
    } catch (e) {
        console.log('TradeVision AI: Direct JSON parsing failed:', e.message);
    }
    return null;
}

// Extract JSON from text using flexible parsing
function extractJsonFromText(text) {
    // Try to find JSON object boundaries
    const jsonStart = text.indexOf('{');
    const jsonEnd = text.lastIndexOf('}');

    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        const potentialJson = text.substring(jsonStart, jsonEnd + 1);
        try {
            const parsed = JSON.parse(potentialJson);
            return validateParsedData(parsed);
        } catch (e) {
            console.log('TradeVision AI: Flexible JSON parsing failed:', e.message);
        }
    }

    return null;
}

// Validate and normalize parsed data
function validateParsedData(parsed) {
    if (!parsed || typeof parsed !== 'object') {
        return null;
    }

    // Handle legacy format (single analysis string)
    if (parsed.analysis && !parsed.market_context) {
        return {
            analysis: typeof parsed.analysis === 'string' ? parsed.analysis : '',
            symbol: typeof parsed.symbol === 'string' ? parsed.symbol.trim() : 'Unknown',
            timeframe: typeof parsed.timeframe === 'string' ? parsed.timeframe.trim() : 'Unknown',
            summary: typeof parsed.summary === 'string' ? parsed.summary.trim() : ''
        };
    }

    // Handle new structured format
    return {
        // Keep raw analysis for backward compatibility if needed, or construct it from parts
        analysis: JSON.stringify(parsed),
        symbol: typeof parsed.symbol === 'string' ? parsed.symbol.trim() : 'Unknown',
        timeframe: typeof parsed.timeframe === 'string' ? parsed.timeframe.trim() : 'Unknown',
        summary: typeof parsed.summary === 'string' ? parsed.summary.trim() : '',

        // New structured fields
        market_context: parsed.market_context || null,
        scenario: parsed.scenario || 'A',
        setup_details: parsed.setup_details || parsed.analysis || '', // Fallback to analysis if setup_details missing
        signals: Array.isArray(parsed.signals) ? parsed.signals : [],
        risk: parsed.risk || null,
        trade_management: parsed.trade_management || null,
        outlook: parsed.outlook || null
    };
}

// Simplified fallback extraction for backward compatibility
function extractAnalysisTextFromResponse(responseText) {
    // Try to extract analysis field if it exists
    if (responseText.includes('"analysis"')) {
        try {
            // More flexible regex to handle various formats
            const analysisMatch = responseText.match(/"analysis"\s*:\s*"([^"]*)"/i);
            if (analysisMatch && analysisMatch[1]) {
                return analysisMatch[1].replace(/\\"/g, '"').trim();
            }
        } catch (e) {
            console.log('Could not extract analysis text from response:', e);
        }
    }

    // Fallback: clean up the text and return
    return responseText
        .replace(/^```json\s*[\s\S]*?\s*```/, '') // Remove JSON code blocks
        .replace(/^```\s*[\s\S]*?\s*```/, '')     // Remove any code blocks
        .replace(/^{.*}$/, '')                    // Remove JSON object wrappers
        .replace(/\\"/g, '"')                     // Unescape quotes
        .replace(/\n{3,}/g, '\n\n')               // Normalize newlines
        .trim();
}


// --- 2. CORE ANALYSIS LOGIC ---

async function handleAnalysis(tab) {
    try {
        console.log('Background: Starting analysis for tab:', tab?.id, tab?.url);

        const settings = await getSettings();
        if (!settings.apiKey) {
            console.log('Background: No API key configured');
            return {
                success: false,
                error: 'API key is not configured. Please set it in the extension options.',
                errorType: 'configuration',
                userAction: 'Open extension options to configure your API key.'
            };
        }

        // Ensure content script is ready with retry
        const pingResult = await sendMessageToTabWithRetry(tab.id, { action: 'ping' }, true);
        if (!pingResult.success) {
            console.log('Background: Content script not ready after retries, analysis aborted');
            return {
                success: false,
                error: 'Content script not ready. Please refresh the TradingView page and try again.',
                errorType: 'content_script',
                userAction: 'Refresh the TradingView page and ensure the extension is enabled.'
            };
        }

        // Hide the panel before taking the screenshot
        await sendMessageToTabWithRetry(tab.id, { action: 'hidePanel' });
        await new Promise(resolve => setTimeout(resolve, 50)); // brief wait for DOM updates

        const screenshotBase64 = await captureVisibleTab(tab.windowId);

        // Show the panel again right after capturing
        await sendMessageToTabWithRetry(tab.id, { action: 'showPanel' });

        // Assemble modular prompt
        let fullUserPrompt = '';

        // 1. Core Strategy (Required)
        if (settings.corePrompt) {
            fullUserPrompt += settings.corePrompt;
        } else {
            // Fallback if core prompt is missing
            fullUserPrompt += settings.customPrompt || '';
        }

        // 2. Signals Module (Optional)
        if (settings.enableSignals && settings.signalsPrompt) {
            fullUserPrompt += '\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
            fullUserPrompt += '⚡ TRADING SIGNALS INSTRUCTIONS:\n';
            fullUserPrompt += settings.signalsPrompt;
        }

        // 3. Risk Management Module (Optional)
        if (settings.enableRisk && settings.riskPrompt) {
            fullUserPrompt += '\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
            fullUserPrompt += '⚖️ RISK MANAGEMENT INSTRUCTIONS:\n';
            fullUserPrompt += settings.riskPrompt;
        }

        // Clean user prompt of any existing JSON instructions
        let cleanUserPrompt = fullUserPrompt.trim();
        cleanUserPrompt = cleanUserPrompt.replace(/JSON RESPONSE FORMAT:[\s\S]*?(?=Provide focused analysis|$)/i, '');
        cleanUserPrompt = cleanUserPrompt.replace(/```json[\s\S]*?```/g, '');

        // Build dynamic JSON schema based on enabled modules
        let jsonSchema = {
            symbol: "extracted_symbol_here",
            timeframe: "extracted_timeframe_here(e.g., 1M, 5M, 15M, 30M, 1H, 4H, 1D, 1W)",
            market_context: {
                trend: "Bullish/Bearish/Neutral",
                market_structure: "Brief description of structure (e.g., Higher Highs, Range Bound)",
                key_levels: ["Support at X", "Resistance at Y"]
            },
            scenario: "A", // Default to A (Setup)
            setup_details: "Detailed analysis of the trade setup based on core strategy",
            summary: "brief_summary_for_preview"
        };

        // Add Signals module if enabled
        if (settings.enableSignals) {
            jsonSchema.signals = [
                { type: "ENTRY", price: "1.2345", reason: "Order block mitigation" },
                { type: "SL", price: "1.2300", reason: "Below swing low" },
                { type: "TP", price: "1.2400", reason: "Next liquidity pool" }
            ];
        }

        // Add Risk module if enabled
        if (settings.enableRisk) {
            jsonSchema.risk = {
                r_r_ratio: "1:3",
                position_size: "1% risk",
                invalidation: "Close below 1.2300"
            };
        }

        // Add JSON response format instructions to user prompt
        const jsonResponseFormat = `

JSON RESPONSE FORMAT:
Provide your analysis in this exact JSON structure. Do NOT wrap the JSON in markdown code blocks. Just return the raw JSON object.

${JSON.stringify(jsonSchema, null, 2)}

CRITICAL FORMATTING RULES:
1. **market_context**: concise bullet points for key levels.
2. **setup_details**: This is the main analysis body. Use **bold** for emphasis. Keep it professional and structured.
3. **signals**: Only include if clear trade signals are visible or derived from the strategy.
4. **risk**: Only include if risk parameters can be reasonably estimated.
5. **No Markdown Code Blocks**: Return ONLY the valid JSON object.
`;

        fullUserPrompt = cleanUserPrompt + jsonResponseFormat;

        // Create system prompt for behavioral instructions
        const systemPrompt = `You are an expert technical analyst specializing in chart pattern recognition and price action analysis.

LANGUAGE REQUIREMENT: Always respond in English. Do not use any other language in your analysis.

CORE BEHAVIORAL GUIDELINES:
1. **Precision**: Extract exact symbol and timeframe from the chart image
2. **Objectivity**: Base analysis strictly on visible chart data, not speculation
3. **Clarity**: Use clear, professional language without jargon unless necessary
4. **Actionability**: Provide specific, measurable observations
5. **Completeness**: Follow all instructions in the user prompt exactly as specified

VISUAL ANALYSIS APPROACH:
- Carefully examine all visible elements: price action, patterns, indicators, volume, annotations
- Identify the current market structure and context
- **Analyze color-coded markers and lines** to determine trade state (ideas vs open positions)
- **Extract P/L information** from visible markers and price levels
- **Identify position types** from visual cues (long vs short, open vs planned)
- Note any visible entry/exit markers, stop losses, or take profit levels
- Recognize and incorporate any technical indicators shown on the chart
- Maintain professional objectivity while providing educational insights

CHART MARKER INTERPRETATION:
- Distinguish between trade ideas (planned setups) and active positions (open trades)
- Read entry prices, stop loss, and take profit levels from visible lines
- Calculate profit/loss from current price vs entry markers
- Identify position direction from color coding and marker placement

RESPONSE REQUIREMENTS:
- Always extract and state the symbol and timeframe first
- Correctly identify the trade state (idea, open position, or no setup)
- Follow the specific analysis framework provided in the user instructions
- Adapt your analysis depth and style to match the user's requested format
- Ensure all observations are grounded in what's actually visible on the chart
- **Always respond in English** - do not use any other language

Remember: Your role is to provide accurate, professional chart analysis following the user's specific methodology and format requirements.`;

        const analysisResponse = await callVisionEngine(systemPrompt, fullUserPrompt, screenshotBase64, settings);

        // Parse AI response using robust parsing function
        const parsedResponse = parseAIResponse(analysisResponse);

        // Use parsed data with proper fallbacks
        // For structured data, analysisContent might be a JSON string, which is fine for history storage
        const analysisContent = parsedResponse.analysis;
        const symbol = parsedResponse.symbol;
        const timeframe = parsedResponse.timeframe;
        const summary = parsedResponse.summary || (typeof analysisContent === 'string' ? analysisContent.substring(0, 100) + '...' : 'Analysis completed');

        await saveAnalysisToHistory(analysisContent, tab, symbol, timeframe, summary);

        // Increment analysis counter to trigger review prompts
        await self.tradeVisionStorage.incrementAnalysisCounter();

        // Return the full parsed object so the panel can use the structured fields
        return {
            success: true,
            analysis: analysisContent,
            market_context: parsedResponse.market_context,
            scenario: parsedResponse.scenario,
            setup_details: parsedResponse.setup_details,
            signals: parsedResponse.signals,
            risk: parsedResponse.risk,
            trade_management: parsedResponse.trade_management,
            outlook: parsedResponse.outlook
        };

    } catch (error) {
        // Ensure panel is shown again in case of an error
        try {
            await sendMessageToTabWithRetry(tab.id, { action: 'showPanel' });
        } catch (e) { /* Ignore errors if tab is closed */ }

        console.error('TradeVision AI - Analysis Error:', error);

        // Enhanced error handling with detailed information
        let errorMessage = error.message;
        let errorType = 'unknown';
        let userAction = 'Please try again or check your settings.';

        if (error instanceof APIError) {
            errorType = error.type;
            userAction = error.userAction || userAction;
        } else if (error.message.includes('API key')) {
            errorType = 'authentication';
            userAction = 'Please check your OpenAI API key in the extension options.';
        } else if (error.message.includes('network') || error.message.includes('connection')) {
            errorType = 'network';
            userAction = 'Please check your internet connection and try again.';
        } else if (error.message.includes('timeout')) {
            errorType = 'timeout';
            userAction = 'The AI service may be busy. Please try again in a moment.';
        }

        return {
            success: false,
            error: errorMessage,
            errorType: errorType,
            userAction: userAction
        };
    }
}

// Dynamic Settings Processor
async function getSettings() {
  const syncResult = await self.tradeVisionStorage.getSettings(['openaiApiKey', 'selectedModel', 'enableSignals', 'enableRisk']);
  const localResult = await self.tradeVisionStorage.getLocalData(['corePrompt', 'signalsPrompt', 'riskPrompt', 'customPrompt']);

  const apiKey = syncResult.openaiApiKey || null;
  let detectedProviderKey = 'openai';
  const providersRegistry = self.AI_PROVIDERS || {};

  if (apiKey) {
    for (const [key, config] of Object.entries(providersRegistry)) {
      if (apiKey.startsWith(config.keyPrefix)) { detectedProviderKey = key; break; }
    }
  }

  const activeProvider = providersRegistry[detectedProviderKey] || { endpoint: 'https://openai.com', defaultModel: 'gpt-4o' };

  return {
    apiKey: apiKey,
    provider: detectedProviderKey,
    endpoint: activeProvider.endpoint,
    selectedModel: syncResult.selectedModel || activeProvider.defaultModel,
    corePrompt: localResult.corePrompt || localResult.customPrompt || 'Analyze this chart.',
    enableSignals: syncResult.enableSignals !== false,
    enableRisk: syncResult.enableRisk !== false
  };
}

async function captureVisibleTab(windowId) {
    try {
        const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
        return dataUrl.split(',')[1];
    } catch (error) {
        console.error('Error capturing tab:', error);
        throw new Error('Failed to capture chart image.');
    }
}

// Comprehensive API error classification system
class APIError extends Error {
    constructor(message, type, retryable = false, userAction = '') {
        super(message);
        this.name = 'APIError';
        this.type = type;
        this.retryable = retryable;
        this.userAction = userAction;
    }
}

// Universal Multi-Modal Vision Payload Network Dispatcher
async function callVisionEngine(systemPrompt, userPrompt, imageBase64, settings) {
  const bodyPayload = {
    model: settings.selectedModel,
    stream: false,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: [
          { type: 'text', text: userPrompt },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${imageBase64}`, detail: 'auto' } }
        ]
      }
    ]
  };

  const response = await fetch(settings.endpoint, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${settings.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(bodyPayload)
  });

  if (!response.ok) throw new Error(`AI Gateway network exception: ${response.status}`);
  const responseData = await response.json();
  return responseData.choices[0].message.content;
}

// Comprehensive error classification function
function classifyAPIError(statusCode, errorData) {
    switch (statusCode) {
        case 400:
            return {
                message: 'Invalid request. Please check your analysis settings and try again.',
                type: 'invalid_request',
                retryable: false,
                userAction: 'Review your custom prompt and analysis settings.'
            };
        case 401:
            return {
                message: 'Invalid API key. Please check your OpenAI API key in the extension settings.',
                type: 'authentication',
                retryable: false,
                userAction: 'Update your API key in the extension options.'
            };
        case 403:
            return {
                message: 'Access forbidden. Your API key may not have permission to access this model.',
                type: 'permission',
                retryable: false,
                userAction: 'Check your OpenAI account permissions or try a different model.'
            };
        case 429:
            return {
                message: 'Rate limit exceeded. Please wait a moment and try again.',
                type: 'rate_limit',
                retryable: true,
                userAction: 'Wait 1-2 minutes before trying again.'
            };
        case 500:
        case 502:
        case 503:
        case 504:
            return {
                message: 'OpenAI service is temporarily unavailable. Please try again later.',
                type: 'service_unavailable',
                retryable: true,
                userAction: 'Try again in a few minutes.'
            };
        default:
            if (errorData?.error?.code === 'invalid_api_key') {
                return {
                    message: 'Invalid API key. Please check your OpenAI API key in the extension settings.',
                    type: 'authentication',
                    retryable: false,
                    userAction: 'Update your API key in the extension options.'
                };
            } else if (errorData?.error?.code === 'insufficient_quota') {
                return {
                    message: 'API quota exceeded. Please check your OpenAI account billing.',
                    type: 'quota',
                    retryable: false,
                    userAction: 'Check your OpenAI billing or wait until the next billing cycle.'
                };
            } else if (errorData?.error?.code === 'rate_limit_exceeded') {
                return {
                    message: 'Rate limit exceeded. Please wait a moment and try again.',
                    type: 'rate_limit',
                    retryable: true,
                    userAction: 'Wait 1-2 minutes before trying again.'
                };
            } else {
                return {
                    message: errorData?.error?.message || `API error: ${statusCode}`,
                    type: 'unknown',
                    retryable: false,
                    userAction: 'Check the extension settings and try again.'
                };
            }
    }
}

// --- MIGRATION & STARTUP HELPERS ---

// Ensure existing active users who already passed milestones still get prompted
async function ensurePendingPromptsOnStartup() {
    try {
        console.log('TradeVision AI: Running startup migration check for pending prompts');

        const tracking = await self.tradeVisionStorage.getReviewTracking();
        const analysisCount = tracking.analysisCount || 0;

        // If the user has passed a milestone but no pending prompt is set, schedule one
        if (!tracking.pendingReviewPrompt) {
            // Determine highest milestone <= analysisCount
            let highest = null;
            for (const m of REVIEW_MILESTONES) {
                if (analysisCount >= m) highest = m;
            }

            // Also handle interval-based milestones after the last defined milestone
            if (!highest && analysisCount > REVIEW_MILESTONES[REVIEW_MILESTONES.length - 1]) {
                // compute interval milestone
                highest = Math.floor((analysisCount - REVIEW_MILESTONES[REVIEW_MILESTONES.length - 1]) / REVIEW_INTERVAL_AFTER_MILESTONES) * REVIEW_INTERVAL_AFTER_MILESTONES + REVIEW_MILESTONES[REVIEW_MILESTONES.length - 1];
            }

            if (highest) {
                const nextMilestone = getNextReviewMilestone(highest);
                console.log('TradeVision AI: Scheduling pending review prompt for existing user. Highest milestone:', highest, 'Next:', nextMilestone);

                await self.tradeVisionStorage.saveReviewTracking({
                    pendingReviewPrompt: true,
                    currentReviewMilestone: highest,
                    nextReviewMilestone: nextMilestone,
                    reviewPromptShownCount: tracking.reviewPromptShownCount || 0,
                    lastReviewPromptShown: tracking.lastReviewPromptShown || null
                });
            }
        }

        // Waitlist: show to active users who reached minimum analysis threshold
        try {
            const waitlist = await self.tradeVisionStorage.getWaitlistTracking();
            const shouldShowWaitlist = !waitlist.waitlistDismissed && (analysisCount >= WAITLIST_MIN_ANALYSIS_COUNT) && ((waitlist.waitlistShownCount || 0) < WAITLIST_MAX_SHOWS_PER_SESSION);
            if (shouldShowWaitlist) {
                console.log('TradeVision AI: Scheduling waitlist banner for existing active user');
                // Increment storage counters
                await self.tradeVisionStorage.saveWaitlistTracking({
                    waitlistShownCount: (waitlist.waitlistShownCount || 0) + 1,
                    lastWaitlistShown: Date.now()
                });

                // Broadcast to open TradingView tabs so the banner can show immediately
                try {
                    const tabs = await chrome.tabs.query({ url: '*://*.tradingview.com/chart/*' });
                    for (const t of tabs) {
                        try {
                            await sendMessageToTabWithRetry(t.id, { action: 'showWaitlistBanner' }, false);
                        } catch (e) {
                            // Non-fatal per-tab
                            console.warn('TradeVision AI: Could not notify tab for waitlist banner:', t.id, e);
                        }
                    }
                } catch (e) {
                    console.warn('TradeVision AI: Could not query tabs to show waitlist banner:', e);
                }
            }
        } catch (e) {
            console.warn('TradeVision AI: Waitlist startup check failed:', e);
        }

    } catch (error) {
        console.error('TradeVision AI: Startup migration check failed:', error);
    }
}

// Run migration check at service worker start (non-blocking)
(async () => {
    try {
        await ensurePendingPromptsOnStartup();
    } catch (e) {
        console.error('TradeVision AI: ensurePendingPromptsOnStartup failed at startup:', e);
    }
})();

async function saveAnalysisToHistory(analysis, tab, preExtractedSymbol = null, preExtractedTimeframe = null, summary = null) {
    try {
        let symbol = preExtractedSymbol;
        let timeframe = preExtractedTimeframe;

        // Only use regex extraction if not provided via JSON
        if (!symbol || symbol === 'Unknown' || !timeframe || timeframe === 'Unknown') {
            // Extract symbol and timeframe from the AI analysis text
            // More flexible regex to handle various formats
            const symbolMatch = analysis.match(/\bSYMBOL:\s*([^\n\r]+)/i) ||
                               analysis.match(/\bSymbol:\s*([^\n\r]+)/i) ||
                               analysis.match(/trading.?pair[:\s]*([^\n\r]+)/i) ||
                               analysis.match(/asset[:\s]*([^\n\r]+)/i) ||
                               analysis.match(/pair[:\s]*([^\n\r]+)/i);

            const timeframeMatch = analysis.match(/\bTIMEFRAME:\s*([^\n\r]+)/i) ||
                                  analysis.match(/\bTimeframe:\s*([^\n\r]+)/i) ||
                                  analysis.match(/interval[:\s]*([^\n\r]+)/i) ||
                                  analysis.match(/period[:\s]*([^\n\r]+)/i) ||
                                  analysis.match(/chart[:\s]*([^\n\r]+)/i);

            symbol = symbolMatch ? symbolMatch[1].trim() : 'Unknown';
            timeframe = timeframeMatch ? timeframeMatch[1].trim() : 'Unknown';

            // Clean up extracted values
            symbol = symbol.replace(/[\[\]]/g, '').trim(); // Remove brackets
            timeframe = timeframe.replace(/[\[\]]/g, '').trim(); // Remove brackets

            // Clean markdown artifacts
            symbol = symbol.replace(/^\*\*|\*\*$/g, '').trim();  // Remove leading/trailing **
            timeframe = timeframe.replace(/^\*\*|\*\*$/g, '').trim();
        }

        console.log('TradeVision AI: Extracted symbol:', symbol, 'timeframe:', timeframe);

        // Fallback to URL parsing if AI fails
        if (symbol === 'Unknown' || timeframe === 'Unknown') {
            const fromUrl = extractSymbolAndTimeframe(tab);
            if (symbol === 'Unknown' && fromUrl.symbol) symbol = fromUrl.symbol;
            if (timeframe === 'Unknown' && fromUrl.timeframe) timeframe = fromUrl.timeframe;
            console.log('TradeVision AI: Using fallback - symbol:', symbol, 'timeframe:', timeframe);
        }

        // Normalize timeframe format for consistency
        timeframe = normalizeTimeframe(timeframe);

        // Ensure we have valid values with better fallback
        if (symbol === 'Unknown' || !symbol || symbol.trim() === '' || symbol === '.') symbol = 'Unknown Symbol';
        if (timeframe === 'Unknown' || !timeframe || timeframe.trim() === '' || timeframe === '.') timeframe = 'Unknown TF';

        // Use provided summary or generate one
        const previewText = summary || cleanMarkdownForPreview(analysis);

        const newHistoryItem = {
            id: `hist_${Date.now()}`,
            timestamp: Date.now(),
            symbol: symbol,
            timeframe: timeframe,
            analysis: analysis,
            preview: previewText
        };

        await self.tradeVisionStorage.saveAnalysisToHistory(newHistoryItem);

    } catch (error) {
        console.error('TradeVision AI: Error saving analysis to history:', error);
    }
}

function extractSymbolAndTimeframe(tab) {
    let symbol = null;
    let timeframe = null;
    let url = tab.url;
    let title = tab.title;

    // First try URL parameters
    if (url) {
        try {
            const urlObj = new URL(url);
            const params = new URLSearchParams(urlObj.search);
            symbol = params.get('symbol');
            timeframe = params.get('interval');

            if (symbol) {
                const parts = symbol.split(':');
                symbol = parts.length > 1 ? parts[1] : parts[0];
            }
        } catch (error) {
            console.error('Error parsing URL:', error);
        }
    }

    // If not found in URL, try parsing the page title
    if ((!symbol || !timeframe) && title) {
        // TradingView title format: "SYMBOL, TIMEFRAME - TradingView"
        const titleMatch = title.match(/^([^,]+),\s*([^-\s]+)\s*-/);
        if (titleMatch) {
            if (!symbol) symbol = titleMatch[1].trim();
            if (!timeframe) timeframe = titleMatch[2].trim();
        }
    }

    return { symbol, timeframe };
}


// --- 3. CLIPBOARD AND OFFSCREEN DOCUMENT LOGIC ---

async function ensureOffscreenClipboard() {
    const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT']
    });
    if (existingContexts.length > 0) return;

    await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['CLIPBOARD'],
        justification: 'Proxying clipboard write access for the panel iframe.',
    });
}

async function sendCopyToOffscreen(text) {
    return await chrome.runtime.sendMessage({
        action: 'offscreen:copy',
        text: text,
    });
}

// Normalize timeframe format for consistent filtering
function normalizeTimeframe(timeframe) {
    if (!timeframe || timeframe === 'Unknown') return 'Unknown TF';

    const normalized = timeframe.toUpperCase().trim();

    // Handle common timeframe formats
    if (normalized === 'D' || normalized === '1D') return '1D';
    if (normalized === '4H') return '4H';
    if (normalized === '1H') return '1H';
    if (normalized === '30' || normalized === '30M') return '30M';
    if (normalized === '15' || normalized === '15M') return '15M';
    if (normalized === '5' || normalized === '5M') return '5M';
    if (normalized === '1' || normalized === '1M') return '1M';

    // Return original if not a standard timeframe
    return normalized;
}

// Helper function to send messages to tabs with robust retry and injection
async function sendMessageToTabWithRetry(tabId, message, injectIfNeeded = false) {
    const maxRetries = 5;
    const baseDelay = 500;
    const maxDelay = 5000;

    // Validate message structure
    if (!message || typeof message !== 'object') {
        console.error('TradeVision AI: Invalid message format:', message);
        return { success: false, error: 'Invalid message format' };
    }

    if (!message.action) {
        console.error('TradeVision AI: Message missing action property:', message);
        return { success: false, error: 'Message missing action property' };
    }

    for (let retry = 0; retry < maxRetries; retry++) {
        try {
            // Check if tab still exists before sending message
            try {
                const tab = await chrome.tabs.get(tabId);
                if (!tab) {
                    console.error('TradeVision AI: Tab not found:', tabId);
                    return { success: false, error: 'Tab not found' };
                }
            } catch (tabError) {
                console.error('TradeVision AI: Error accessing tab:', tabError);
                return { success: false, error: 'Tab inaccessible' };
            }

            // Send message with timeout
            const response = await Promise.race([
                chrome.tabs.sendMessage(tabId, message),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Message timeout')), 5000))
            ]);

            // Validate response structure
            if (response && typeof response === 'object') {
                return { success: true, response: response };
            }

            return { success: true };

        } catch (error) {
            console.error(`TradeVision AI: Message send failed (attempt ${retry + 1}/${maxRetries}):`, error);

            // Determine if we should retry based on error type
            const shouldRetry = shouldRetryMessage(error, retry, maxRetries);

            if (shouldRetry) {
                // Exponential backoff with jitter
                const delay = Math.min(baseDelay * Math.pow(2, retry), maxDelay);
                const jitter = Math.random() * 200 - 100; // ±100ms jitter
                const actualDelay = Math.max(100, delay + jitter);

                console.log(`TradeVision AI: Retrying in ${actualDelay}ms`);

                // If injection is requested and it's the first failure, try to inject content script
                if (injectIfNeeded && retry === 0) {
                    try {
                        await injectContentScriptWithRetry(tabId);
                    } catch (injectError) {
                        console.error('TradeVision AI: Content script injection failed:', injectError);
                    }
                }

                await new Promise(resolve => setTimeout(resolve, actualDelay));
            } else {
                return {
                    success: false,
                    error: error.message,
                    errorType: classifyError(error)
                };
            }
        }
    }

    return { success: false, error: 'All retry attempts failed' };
}

// Helper function to determine if a message should be retried
function shouldRetryMessage(error, retryCount, maxRetries) {
    if (retryCount >= maxRetries - 1) return false;

    // Don't retry for these error types
    const nonRetryableErrors = [
        'Tab not found',
        'Tab inaccessible',
        'Invalid message format',
        'Message missing action property'
    ];

    if (nonRetryableErrors.some(msg => error.message.includes(msg))) {
        return false;
    }

    // Retry for connection issues, timeouts, and general errors
    return true;
}

// Classify errors for better handling
function classifyError(error) {
    if (error.message.includes('timeout')) return 'timeout';
    if (error.message.includes('not found')) return 'tab_not_found';
    if (error.message.includes('inaccessible')) return 'tab_inaccessible';
    if (error.message.includes('Extension context invalidated')) return 'context_invalidated';
    if (error.message.includes('Could not establish connection')) return 'connection_failed';
    return 'unknown';
}

// Improved content script injection with retry logic
async function injectContentScriptWithRetry(tabId) {
    const maxInjectionRetries = 2;

    for (let attempt = 0; attempt < maxInjectionRetries; attempt++) {
        try {
            await chrome.scripting.executeScript({
                target: { tabId: tabId },
                // Use the same path that is declared in manifest.json
                files: ['content-script.js']
            });
            console.log('TradeVision AI: Content script injected successfully');

            // Wait for content script initialization
            await new Promise(resolve => setTimeout(resolve, 1000 + (attempt * 500)));
            return true;
        } catch (injectError) {
            console.error(`TradeVision AI: Content script injection failed (attempt ${attempt + 1}/${maxInjectionRetries}):`, injectError);

            if (attempt < maxInjectionRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    }

    throw new Error('Content script injection failed after all retries');
}
