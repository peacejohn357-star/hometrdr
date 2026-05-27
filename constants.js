/**
 * TradeVision AI - Constants & Configuration
 * Centralized configuration for review prompts, waitlist banners, and analytics
 */

// ============================================================================
// REVIEW PROMPT CONFIGURATION
// ============================================================================

/**
 * Analysis count milestones that trigger review prompts
 * Shows at: 3rd, 15th, 30th, 50th analysis, then every 20 analyses after
 */
const REVIEW_MILESTONES = [3, 15, 30, 50];

/**
 * After reaching the last milestone, show review every N analyses
 */
const REVIEW_INTERVAL_AFTER_MILESTONES = 20;

/**
 * Maximum number of times to show review prompt per milestone
 * After this, user must reach next milestone to see prompt again
 */
const MAX_REVIEW_PROMPT_SHOWS_PER_MILESTONE = 3;

/**
 * Minimum time (in milliseconds) between review prompt displays
 * 24 hours = 86400000 ms
 */
const REVIEW_PROMPT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/**
 * Chrome Web Store review URL
 */
const REVIEW_URL = 'https://chromewebstore.google.com/detail/tradevision-ai-tradingvie/your-extension-id';

// ============================================================================
// WAITLIST BANNER CONFIGURATION
// ============================================================================

/**
 * TradeVision Pro waitlist URL
 */
const WAITLIST_URL = 'https://tally.so/r/obbDLx';

/**
 * Minimum analysis count before showing waitlist banner
 * Shows after user has completed at least this many analyses
 */
const WAITLIST_MIN_ANALYSIS_COUNT = 3;

/**
 * Maximum number of times to show waitlist banner per session
 */
const WAITLIST_MAX_SHOWS_PER_SESSION = 2;

/**
 * Maximum total times to show waitlist banner (lifetime)
 * After this, banner is permanently dismissed
 */
const WAITLIST_MAX_TOTAL_SHOWS = 10;

/**
 * Minimum time (in milliseconds) between waitlist banner displays
 * 48 hours = 172800000 ms
 */
const WAITLIST_COOLDOWN_MS = 48 * 60 * 60 * 1000;

/**
 * Time (in milliseconds) to wait after review prompt dismissed before showing waitlist
 * 5 minutes = 300000 ms
 */
const WAITLIST_DELAY_AFTER_REVIEW_MS = 5 * 60 * 1000;

// ============================================================================
// DISPLAY RULES & PRIORITIES
// ============================================================================

/**
 * Display priority rules:
 * 1. Review prompt takes priority over waitlist banner
 * 2. Only one promotional element shown at a time
 * 3. Waitlist banner shows only after review prompt is dismissed/clicked
 * 4. Both respect their individual cooldown periods
 */
const DISPLAY_RULES = {
    // Never show both at the same time
    EXCLUSIVE_DISPLAY: true,

    // Review prompt has higher priority
    REVIEW_PRIORITY: true,

    // Wait this long after review dismissed before showing waitlist
    WAITLIST_DELAY_AFTER_REVIEW: WAITLIST_DELAY_AFTER_REVIEW_MS,

    // Session-based tracking (resets on extension reload)
    SESSION_BASED_TRACKING: true
};

// ============================================================================
// ANALYTICS EVENT NAMES
// ============================================================================

/**
 * Analytics event names for tracking user interactions
 * Use with: window.analytics?.track(EVENT_NAME, properties)
 */
const ANALYTICS_EVENTS = {
    // Review Prompt Events
    REVIEW_PROMPT_SHOWN: 'review_prompt_shown',
    REVIEW_PROMPT_CLICKED: 'review_prompt_clicked',
    REVIEW_PROMPT_DISMISSED: 'review_prompt_dismissed',
    REVIEW_LINK_CLICKED: 'review_link_clicked',

    // Waitlist Banner Events
    WAITLIST_BANNER_SHOWN: 'waitlist_banner_shown',
    WAITLIST_BANNER_CLICKED: 'waitlist_banner_clicked',
    WAITLIST_BANNER_DISMISSED: 'waitlist_banner_dismissed',
    WAITLIST_LINK_CLICKED: 'waitlist_link_clicked',

    // Analysis Events
    ANALYSIS_COMPLETED: 'analysis_completed',
    ANALYSIS_MILESTONE_REACHED: 'analysis_milestone_reached'
};

// ============================================================================
// STORAGE KEYS
// ============================================================================

/**
 * Chrome storage keys for tracking state
 */
const STORAGE_KEYS = {
    // Review Tracking
    REVIEW_TRACKING: 'reviewTracking',
    ANALYSIS_COUNT: 'analysisCount',
    REVIEW_QUEUE: 'reviewPromptQueue',
    CURRENT_REVIEW_MILESTONE: 'currentReviewMilestone',
    REVIEW_PROMPT_SHOWN_COUNT: 'reviewPromptShownCount',
    LAST_REVIEW_PROMPT_SHOWN: 'lastReviewPromptShown',
    REVIEW_CLICKED: 'reviewClicked',

    // Waitlist Tracking
    WAITLIST_TRACKING: 'waitlistTracking',
    WAITLIST_SHOWN_COUNT: 'waitlistShownCount',
    WAITLIST_SESSION_COUNT: 'waitlistSessionCount',
    LAST_WAITLIST_SHOWN: 'lastWaitlistShown',
    WAITLIST_DISMISSED: 'waitlistDismissed',
    WAITLIST_CLICKED: 'waitlistClicked',

    // Session State
    SESSION_ID: 'sessionId',
    SESSION_START: 'sessionStart',
    LAST_REVIEW_DISMISSED_TIME: 'lastReviewDismissedTime'
};

// ============================================================================
// UI CONFIGURATION
// ============================================================================

/**
 * UI timing and animation settings
 */
const UI_CONFIG = {
    // Review prompt auto-hide disabled (persistent until clicked)
    REVIEW_AUTO_HIDE: false,

    // Waitlist banner auto-hide after 30 seconds
    WAITLIST_AUTO_HIDE: true,
    WAITLIST_AUTO_HIDE_DELAY_MS: 30 * 1000,

    // Animation durations
    FADE_IN_DURATION_MS: 300,
    FADE_OUT_DURATION_MS: 200,
    SLIDE_IN_DURATION_MS: 400,

    // Z-index layers
    Z_INDEX_REVIEW_PROMPT: 100001,
    Z_INDEX_WAITLIST_BANNER: 100000,
    Z_INDEX_PANEL: 99999
};

// ============================================================================
// AI VISION & DATA PROVIDER REGISTRY
// ============================================================================

/**
 * Centralized mapping of available AI providers, endpoints, and vision models.
 *
 * Each provider object must contain:
 *   - name        {String}  Display name used in UI logging and error messages.
 *   - endpoint    {String}  Base URL that fetch() calls inside the background service worker.
 *   - keyPrefix   {String}  First characters of the API key — used for automatic provider routing.
 *   - defaultModel{String}  Target vision model (must support image/screenshot inputs).
 *
 * To add a new provider, append a new key-value pair following the existing structure.
 * No changes to core logic are required — the background worker routes automatically
 * based on keyPrefix.
 *
 * Examples of additional providers you can add:
 *
 *   grok: {
 *     name: 'xAI Grok',
 *     endpoint: 'https://x.ai',
 *     keyPrefix: 'xai-',
 *     defaultModel: 'grok-2-vision-1212'
 *   },
 *
 *   gemini: {
 *     name: 'Google Gemini',
 *     endpoint: 'https://googleapis.com',
 *     keyPrefix: 'AIzaSy',
 *     defaultModel: 'gemini-2.5-flash'
 *   }
 */
const AI_PROVIDERS = {
  groq: {
    name: 'Groq Cloud Inference',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    keyPrefix: 'gsk_',
    defaultModel: 'llama-3.2-11b-vision-preview'
  },
  openai: {
    name: 'OpenAI Platform Terminal',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    keyPrefix: 'sk-',
    defaultModel: 'gpt-4o'
  }
};

if (typeof self !== 'undefined') {
    self.REVIEW_MILESTONES = REVIEW_MILESTONES;
    self.REVIEW_INTERVAL_AFTER_MILESTONES = REVIEW_INTERVAL_AFTER_MILESTONES;
    self.MAX_REVIEW_PROMPT_SHOWS_PER_MILESTONE = MAX_REVIEW_PROMPT_SHOWS_PER_MILESTONE;
    self.REVIEW_PROMPT_COOLDOWN_MS = REVIEW_PROMPT_COOLDOWN_MS;
    self.REVIEW_URL = REVIEW_URL;
    self.WAITLIST_URL = WAITLIST_URL;
    self.WAITLIST_MIN_ANALYSIS_COUNT = WAITLIST_MIN_ANALYSIS_COUNT;
    self.WAITLIST_MAX_SHOWS_PER_SESSION = WAITLIST_MAX_SHOWS_PER_SESSION;
    self.WAITLIST_MAX_TOTAL_SHOWS = WAITLIST_MAX_TOTAL_SHOWS;
    self.WAITLIST_COOLDOWN_MS = WAITLIST_COOLDOWN_MS;
    self.WAITLIST_DELAY_AFTER_REVIEW_MS = WAITLIST_DELAY_AFTER_REVIEW_MS;
    self.DISPLAY_RULES = DISPLAY_RULES;
    self.ANALYTICS_EVENTS = ANALYTICS_EVENTS;
    self.STORAGE_KEYS = STORAGE_KEYS;
    self.UI_CONFIG = UI_CONFIG;
    self.AI_PROVIDERS = AI_PROVIDERS;
    self.getNextReviewMilestone = getNextReviewMilestone;
    self.isReviewMilestone = isReviewMilestone;
    self.generateSessionId = generateSessionId;
    self.trackEvent = trackEvent;
}
if (typeof window !== 'undefined') {
    window.REVIEW_MILESTONES = REVIEW_MILESTONES;
    window.REVIEW_INTERVAL_AFTER_MILESTONES = REVIEW_INTERVAL_AFTER_MILESTONES;
    window.MAX_REVIEW_PROMPT_SHOWS_PER_MILESTONE = MAX_REVIEW_PROMPT_SHOWS_PER_MILESTONE;
    window.REVIEW_PROMPT_COOLDOWN_MS = REVIEW_PROMPT_COOLDOWN_MS;
    window.REVIEW_URL = REVIEW_URL;
    window.WAITLIST_URL = WAITLIST_URL;
    window.WAITLIST_MIN_ANALYSIS_COUNT = WAITLIST_MIN_ANALYSIS_COUNT;
    window.WAITLIST_MAX_SHOWS_PER_SESSION = WAITLIST_MAX_SHOWS_PER_SESSION;
    window.WAITLIST_MAX_TOTAL_SHOWS = WAITLIST_MAX_TOTAL_SHOWS;
    window.WAITLIST_COOLDOWN_MS = WAITLIST_COOLDOWN_MS;
    window.WAITLIST_DELAY_AFTER_REVIEW_MS = WAITLIST_DELAY_AFTER_REVIEW_MS;
    window.DISPLAY_RULES = DISPLAY_RULES;
    window.ANALYTICS_EVENTS = ANALYTICS_EVENTS;
    window.STORAGE_KEYS = STORAGE_KEYS;
    window.UI_CONFIG = UI_CONFIG;
    window.AI_PROVIDERS = AI_PROVIDERS;
    window.getNextReviewMilestone = getNextReviewMilestone;
    window.isReviewMilestone = isReviewMilestone;
    window.generateSessionId = generateSessionId;
    window.trackEvent = trackEvent;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate next review milestone based on current analysis count
 * @param {number} currentCount - Current analysis count
 * @returns {number} Next milestone count
 */
function getNextReviewMilestone(currentCount) {
    // Find first milestone greater than current count
    for (const milestone of REVIEW_MILESTONES) {
        if (currentCount < milestone) {
            return milestone;
        }
    }

    // After all milestones, calculate next interval-based milestone
    const lastMilestone = REVIEW_MILESTONES[REVIEW_MILESTONES.length - 1];
    const countAfterLast = currentCount - lastMilestone;
    const intervalsCompleted = Math.floor(countAfterLast / REVIEW_INTERVAL_AFTER_MILESTONES);
    return lastMilestone + ((intervalsCompleted + 1) * REVIEW_INTERVAL_AFTER_MILESTONES);
}

/**
 * Check if current count is a review milestone
 * @param {number} count - Analysis count to check
 * @returns {boolean} True if count is a milestone
 */
function isReviewMilestone(count) {
    // Check if in predefined milestones
    if (REVIEW_MILESTONES.includes(count)) {
        return true;
    }

    // Check if it's an interval-based milestone after the last predefined one
    const lastMilestone = REVIEW_MILESTONES[REVIEW_MILESTONES.length - 1];
    if (count > lastMilestone) {
        const countAfterLast = count - lastMilestone;
        return countAfterLast % REVIEW_INTERVAL_AFTER_MILESTONES === 0;
    }

    return false;
}

/**
 * Generate a unique session ID
 * @returns {string} Session ID
 */
function generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Track analytics event (wrapper for analytics integration)
 * @param {string} eventName - Event name from ANALYTICS_EVENTS
 * @param {object} properties - Event properties
 */
function trackEvent(eventName, properties = {}) {
    try {
        // Check if analytics is available
        if (typeof window !== 'undefined' && window.analytics && typeof window.analytics.track === 'function') {
            window.analytics.track(eventName, {
                ...properties,
                timestamp: Date.now(),
                extension_version: chrome?.runtime?.getManifest?.()?.version || 'unknown'
            });
        } else {
            // Fallback: log to console in development
            console.log(`[TradeVision AI Analytics] ${eventName}`, properties);
        }
    } catch (error) {
        console.error('[TradeVision AI] Analytics tracking error:', error);
    }
}

// ============================================================================
// EXPORTS - Make available globally for importScripts() and as module exports
// ============================================================================

// For ES6 modules (content scripts)
if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = {
        REVIEW_MILESTONES,
        REVIEW_INTERVAL_AFTER_MILESTONES,
        MAX_REVIEW_PROMPT_SHOWS_PER_MILESTONE,
        REVIEW_PROMPT_COOLDOWN_MS,
        REVIEW_URL,
        WAITLIST_URL,
        WAITLIST_MIN_ANALYSIS_COUNT,
        WAITLIST_MAX_SHOWS_PER_SESSION,
        WAITLIST_MAX_TOTAL_SHOWS,
        WAITLIST_COOLDOWN_MS,
        WAITLIST_DELAY_AFTER_REVIEW_MS,
        DISPLAY_RULES,
        ANALYTICS_EVENTS,
        STORAGE_KEYS,
        UI_CONFIG,
        AI_PROVIDERS,
        getNextReviewMilestone,
        isReviewMilestone,
        generateSessionId,
        trackEvent
    };
}
