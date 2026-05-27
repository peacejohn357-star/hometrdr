/**
 * @license
 * Copyright (c) 2024 CRX Universal LLC. All Rights Reserved.
 *
 * This code is licensed under a commercial license.
 * See the LICENSE.md file for details.
 */

/**
 * TradeVision AI Storage Utility
 * Standardizes storage operations with retry mechanisms and error handling
 */

// Constants will be loaded via importScripts in background.js
// or via script tag in HTML files - they're available globally

class StorageUtils {
    constructor() {
        this.maxRetries = 3;
        this.baseDelay = 500;
    }

    /**
     * Standardized storage operation with retry mechanism
     */
    async _executeWithRetry(operation, storageType, ...args) {
        let lastError = null;

        // Check if Chrome storage API is available
        if (!chrome.storage || !chrome.storage[storageType]) {
            throw new StorageError(
                `Chrome ${storageType} storage API not available`,
                storageType,
                new Error('Storage API unavailable - extension context may be invalid')
            );
        }

        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            try {
                const result = await operation(...args);
                return result;
            } catch (error) {
                lastError = error;
                console.warn(`TradeVision AI: Storage ${storageType} operation failed (attempt ${attempt + 1}/${this.maxRetries + 1}):`, error);

                // Don't retry for certain error types
                if (error.message.includes('QUOTA_BYTES') ||
                    error.message.includes('quota') ||
                    error.message.includes('Extension context invalidated')) {
                    throw new StorageError(
                        `Storage ${storageType} operation failed: ${error.message}`,
                        storageType,
                        error
                    );
                }

                if (attempt < this.maxRetries) {
                    const delay = this.baseDelay * Math.pow(2, attempt);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        throw new StorageError(
            `Storage operation failed after ${this.maxRetries + 1} attempts. Please check storage permissions and try again.`,
            storageType,
            lastError
        );
    }

    /**
     * SYNC STORAGE - For settings that should sync across devices
     */

    // Get settings from sync storage
    async getSettings(keys) {
        return await this._executeWithRetry(
            () => chrome.storage.sync.get(keys),
            'sync'
        );
    }

    // Set settings in sync storage
    async setSettings(data) {
        return await this._executeWithRetry(
            () => chrome.storage.sync.set(data),
            'sync'
        );
    }

    // Remove settings from sync storage
    async removeSettings(keys) {
        return await this._executeWithRetry(
            () => chrome.storage.sync.remove(keys),
            'sync'
        );
    }

    /**
     * LOCAL STORAGE - For temporary data that doesn't need syncing
     */

    // Get data from local storage
    async getLocalData(keys) {
        return await this._executeWithRetry(
            () => chrome.storage.local.get(keys),
            'local'
        );
    }

    // Set data in local storage
    async setLocalData(data) {
        return await this._executeWithRetry(
            () => chrome.storage.local.set(data),
            'local'
        );
    }

    // Remove data from local storage
    async removeLocalData(keys) {
        return await this._executeWithRetry(
            () => chrome.storage.local.remove(keys),
            'local'
        );
    }

    /**
     * Specific utility functions for common operations
     */

    // Get API key with validation
    async getApiKey() {
        const result = await this.getSettings(['openaiApiKey']);
        return result.openaiApiKey || null;
    }

    /**
     * Validates and saves an AI provider API key.
     * Dynamically evaluates prefixes against the registered provider catalog map.
     * @param {string} apiKey - The raw API key entered by the user.
     */
    async saveApiKey(apiKey) {
      if (!apiKey || typeof apiKey !== 'string') {
        throw new StorageError('API key verification failed: Token string is invalid.', 'sync');
      }

      const trimmedKey = apiKey.trim();
      const providersRegistry = self.AI_PROVIDERS || window.AI_PROVIDERS || {};

      const isValidProviderKey = Object.values(providersRegistry).some(provider =>
        trimmedKey.startsWith(provider.keyPrefix)
      );

      if (!isValidProviderKey) {
        throw new StorageError('Invalid API key formatting signature. Credential prefixes are not recognized by any registered AI vendor models (e.g., Groq keys must start with "gsk_").', 'sync');
      }

      return await this.setSettings({ openaiApiKey: trimmedKey });
    }

    // Get analysis history
    async getAnalysisHistory() {
        const result = await this.getLocalData(['analysisHistory']);
        return result.analysisHistory || [];
    }

    // Save analysis to history (limits to 50 entries)
    async saveAnalysisToHistory(analysisData) {
        const currentHistory = await this.getAnalysisHistory();
        const newHistory = [analysisData, ...currentHistory].slice(0, 50);
        return await this.setLocalData({ analysisHistory: newHistory });
    }

    // Clear analysis history
    async clearAnalysisHistory() {
        return await this.setLocalData({ analysisHistory: [] });
    }

    // Get panel geometry (position and size)
    async getPanelGeometry() {
        const result = await this.getLocalData(['tvPanelPos', 'tvPanelSize']);
        return {
            pos: result.tvPanelPos || { x: null, y: null },
            size: result.tvPanelSize || { w: null, h: null }
        };
    }

    // Save panel geometry
    async savePanelGeometry(pos, size) {
        return await this.setLocalData({
            tvPanelPos: pos,
            tvPanelSize: size
        });
    }

    // Get review tracking data with comprehensive error handling (NEW QUEUE-BASED SYSTEM)
    async getReviewTracking() {
        console.log('TradeVision AI: StorageUtils.getReviewTracking() called');
        try {
            const result = await this.getLocalData([
                'analysisCount',
                'currentReviewMilestone',
                'nextReviewMilestone',
                'pendingReviewPrompt',
                'reviewPromptShownCount',
                'lastReviewPromptShown',
                'reviewClicked',
                'reviewClickedAt',
                'reviewPromptDismissedAt'
            ]);

            console.log('TradeVision AI: Raw storage data retrieved:', result);

            const analysisCount = typeof result.analysisCount === 'number' ? Math.max(0, result.analysisCount) : 0;

            // Validate and normalize tracking data
            const normalizedData = {
                analysisCount,
                currentReviewMilestone: typeof result.currentReviewMilestone === 'number' ? result.currentReviewMilestone : null,
                nextReviewMilestone: typeof result.nextReviewMilestone === 'number' ? result.nextReviewMilestone : getNextReviewMilestone(analysisCount),
                pendingReviewPrompt: !!result.pendingReviewPrompt,
                reviewPromptShownCount: typeof result.reviewPromptShownCount === 'number' ? Math.max(0, result.reviewPromptShownCount) : 0,
                lastReviewPromptShown: typeof result.lastReviewPromptShown === 'number' ? result.lastReviewPromptShown : null,
                reviewClicked: !!result.reviewClicked,
                reviewClickedAt: typeof result.reviewClickedAt === 'number' ? result.reviewClickedAt : null,
                reviewPromptDismissedAt: typeof result.reviewPromptDismissedAt === 'number' ? result.reviewPromptDismissedAt : null
            };

            console.log('TradeVision AI: Normalized review tracking data:', normalizedData);
            return normalizedData;
        } catch (error) {
            console.error('TradeVision AI: Error getting review tracking:', error);
            // Return safe default values
            const fallbackData = {
                analysisCount: 0,
                currentReviewMilestone: null,
                nextReviewMilestone: REVIEW_MILESTONES[0], // First milestone
                pendingReviewPrompt: false,
                reviewPromptShownCount: 0,
                lastReviewPromptShown: null,
                reviewClicked: false,
                reviewClickedAt: null,
                reviewPromptDismissedAt: null
            };
            console.log('TradeVision AI: Returning fallback tracking data:', fallbackData);
            return fallbackData;
        }
    }

    // Save review tracking data with validation and error handling (NEW QUEUE-BASED SYSTEM)
    async saveReviewTracking(data) {
        console.log('TradeVision AI: StorageUtils.saveReviewTracking() called with data:', data);
        try {
            if (!data || typeof data !== 'object') {
                throw new Error('Invalid review tracking data');
            }

            // Validate and sanitize data before saving
            const sanitizedData = {};

            if ('analysisCount' in data) {
                sanitizedData.analysisCount = typeof data.analysisCount === 'number' ? Math.max(0, data.analysisCount) : 0;
            }

            if ('currentReviewMilestone' in data) {
                sanitizedData.currentReviewMilestone = typeof data.currentReviewMilestone === 'number' ? data.currentReviewMilestone : null;
            }

            if ('nextReviewMilestone' in data) {
                sanitizedData.nextReviewMilestone = typeof data.nextReviewMilestone === 'number' ? data.nextReviewMilestone : null;
            }

            if ('pendingReviewPrompt' in data) {
                sanitizedData.pendingReviewPrompt = !!data.pendingReviewPrompt;
            }

            if ('reviewPromptShownCount' in data) {
                sanitizedData.reviewPromptShownCount = typeof data.reviewPromptShownCount === 'number' ? Math.max(0, data.reviewPromptShownCount) : 0;
            }

            if ('lastReviewPromptShown' in data) {
                sanitizedData.lastReviewPromptShown = typeof data.lastReviewPromptShown === 'number' ? data.lastReviewPromptShown : null;
            }

            if ('reviewClicked' in data) {
                sanitizedData.reviewClicked = !!data.reviewClicked;
            }

            if ('reviewClickedAt' in data) {
                sanitizedData.reviewClickedAt = typeof data.reviewClickedAt === 'number' ? data.reviewClickedAt : null;
            }

            if ('reviewPromptDismissedAt' in data) {
                sanitizedData.reviewPromptDismissedAt = typeof data.reviewPromptDismissedAt === 'number' ? data.reviewPromptDismissedAt : null;
            }

            console.log('TradeVision AI: Sanitized data for storage:', sanitizedData);
            const result = await this.setLocalData(sanitizedData);
            console.log('TradeVision AI: Review tracking data saved successfully');
            return result;
        } catch (error) {
            console.error('TradeVision AI: Error saving review tracking:', error);
            throw error; // Re-throw to allow callers to handle
        }
    }

    // Increment analysis counter and handle review prompts with NEW QUEUE-BASED SYSTEM
    async incrementAnalysisCounter() {
        console.log('TradeVision AI: StorageUtils.incrementAnalysisCounter() called');
        try {
            const tracking = await this.getReviewTracking();
            console.log('TradeVision AI: Current tracking before increment:', tracking);

            const newCount = (tracking.analysisCount || 0) + 1;
            console.log('TradeVision AI: New analysis count will be:', newCount);

            await this.setLocalData({ analysisCount: newCount });
            console.log('TradeVision AI: Analysis count updated in storage');

            // Track analytics event
            trackEvent(ANALYTICS_EVENTS.ANALYSIS_COMPLETED, {
                count: newCount,
                milestone: isReviewMilestone(newCount)
            });

            // Check if this count is a review milestone
            if (isReviewMilestone(newCount)) {
                console.log('TradeVision AI: ✅ Review milestone reached:', newCount);

                // Only set pending if user hasn't clicked review yet or if it's a new milestone
                if (!tracking.reviewClicked || newCount > (tracking.currentReviewMilestone || 0)) {
                    console.log('TradeVision AI: ✅ Setting review prompt flags for milestone:', newCount);

                    const nextMilestone = getNextReviewMilestone(newCount);

                    await this.setLocalData({
                        pendingReviewPrompt: true,
                        currentReviewMilestone: newCount,
                        nextReviewMilestone: nextMilestone,
                        reviewPromptShownCount: 0 // Reset for new milestone
                    });

                    // Track milestone analytics
                    trackEvent(ANALYTICS_EVENTS.ANALYSIS_MILESTONE_REACHED, {
                        milestone: newCount,
                        nextMilestone
                    });

                    console.log('TradeVision AI: ✅ Review prompt scheduled for milestone:', newCount, 'Next:', nextMilestone);

                    // Verify the flags were set
                    const verifyTracking = await this.getReviewTracking();
                    console.log('TradeVision AI: ✅ Verification - tracking after setting flags:', {
                        pendingReviewPrompt: verifyTracking.pendingReviewPrompt,
                        currentReviewMilestone: verifyTracking.currentReviewMilestone,
                        nextReviewMilestone: verifyTracking.nextReviewMilestone
                    });
                } else {
                    console.log('TradeVision AI: ❌ User already clicked review or milestone already processed');
                }
            } else {
                console.log('TradeVision AI: ❌ Not a review milestone. Current:', newCount, 'Next milestone:', tracking.nextReviewMilestone);
            }

            return newCount;
        } catch (error) {
            console.error('TradeVision AI: Error incrementing analysis counter:', error);
            // Return a fallback count to avoid breaking the UI
            try {
                const fallbackTracking = await this.getReviewTracking();
                const fallbackCount = (fallbackTracking.analysisCount || 0) + 1;
                console.log('TradeVision AI: Using fallback count:', fallbackCount);
                return fallbackCount;
            } catch (fallbackError) {
                console.error('TradeVision AI: Fallback count retrieval failed:', fallbackError);
                console.log('TradeVision AI: Returning minimum fallback count: 1');
                return 1; // Minimum fallback
            }
        }
    }

    // Get waitlist tracking data
    async getWaitlistTracking() {
        console.log('TradeVision AI: StorageUtils.getWaitlistTracking() called');
        try {
            const result = await this.getLocalData([
                'waitlistShownCount',
                'waitlistSessionCount',
                'lastWaitlistShown',
                'waitlistDismissed',
                'waitlistDismissedAt',
                'waitlistClicked',
                'waitlistClickedAt',
                'sessionId',
                'sessionStart'
            ]);

            console.log('TradeVision AI: Raw waitlist data retrieved:', result);

            const normalizedData = {
                waitlistShownCount: typeof result.waitlistShownCount === 'number' ? Math.max(0, result.waitlistShownCount) : 0,
                waitlistSessionCount: typeof result.waitlistSessionCount === 'number' ? Math.max(0, result.waitlistSessionCount) : 0,
                lastWaitlistShown: typeof result.lastWaitlistShown === 'number' ? result.lastWaitlistShown : null,
                waitlistDismissed: !!result.waitlistDismissed,
                waitlistDismissedAt: typeof result.waitlistDismissedAt === 'number' ? result.waitlistDismissedAt : null,
                waitlistClicked: !!result.waitlistClicked,
                waitlistClickedAt: typeof result.waitlistClickedAt === 'number' ? result.waitlistClickedAt : null,
                sessionId: typeof result.sessionId === 'string' ? result.sessionId : null,
                sessionStart: typeof result.sessionStart === 'number' ? result.sessionStart : null
            };

            console.log('TradeVision AI: Normalized waitlist tracking data:', normalizedData);
            return normalizedData;
        } catch (error) {
            console.error('TradeVision AI: Error getting waitlist tracking:', error);
            return {
                waitlistShownCount: 0,
                waitlistSessionCount: 0,
                lastWaitlistShown: null,
                waitlistDismissed: false,
                waitlistDismissedAt: null,
                waitlistClicked: false,
                waitlistClickedAt: null,
                sessionId: null,
                sessionStart: null
            };
        }
    }

    // Save waitlist tracking data
    async saveWaitlistTracking(data) {
        console.log('TradeVision AI: StorageUtils.saveWaitlistTracking() called with data:', data);
        try {
            if (!data || typeof data !== 'object') {
                throw new Error('Invalid waitlist tracking data');
            }

            const sanitizedData = {};

            if ('waitlistShownCount' in data) {
                sanitizedData.waitlistShownCount = typeof data.waitlistShownCount === 'number' ? Math.max(0, data.waitlistShownCount) : 0;
            }

            if ('waitlistSessionCount' in data) {
                sanitizedData.waitlistSessionCount = typeof data.waitlistSessionCount === 'number' ? Math.max(0, data.waitlistSessionCount) : 0;
            }

            if ('lastWaitlistShown' in data) {
                sanitizedData.lastWaitlistShown = typeof data.lastWaitlistShown === 'number' ? data.lastWaitlistShown : null;
            }

            if ('waitlistDismissed' in data) {
                sanitizedData.waitlistDismissed = !!data.waitlistDismissed;
            }

            if ('waitlistDismissedAt' in data) {
                sanitizedData.waitlistDismissedAt = typeof data.waitlistDismissedAt === 'number' ? data.waitlistDismissedAt : null;
            }

            if ('waitlistClicked' in data) {
                sanitizedData.waitlistClicked = !!data.waitlistClicked;
            }

            if ('waitlistClickedAt' in data) {
                sanitizedData.waitlistClickedAt = typeof data.waitlistClickedAt === 'number' ? data.waitlistClickedAt : null;
            }

            if ('sessionId' in data) {
                sanitizedData.sessionId = typeof data.sessionId === 'string' ? data.sessionId : null;
            }

            if ('sessionStart' in data) {
                sanitizedData.sessionStart = typeof data.sessionStart === 'number' ? data.sessionStart : null;
            }

            console.log('TradeVision AI: Sanitized waitlist data for storage:', sanitizedData);
            const result = await this.setLocalData(sanitizedData);
            console.log('TradeVision AI: Waitlist tracking data saved successfully');
            return result;
        } catch (error) {
            console.error('TradeVision AI: Error saving waitlist tracking:', error);
            throw error;
        }
    }

    // Initialize or get current session
    async initializeSession() {
        console.log('TradeVision AI: Initializing session');
        try {
            const waitlistTracking = await this.getWaitlistTracking();

            // Check if we need a new session (no session ID or session older than 24 hours)
            const now = Date.now();
            const sessionAge = waitlistTracking.sessionStart ? now - waitlistTracking.sessionStart : Infinity;
            const needsNewSession = !waitlistTracking.sessionId || sessionAge > (24 * 60 * 60 * 1000);

            if (needsNewSession) {
                const newSessionId = generateSessionId();
                console.log('TradeVision AI: Creating new session:', newSessionId);

                await this.saveWaitlistTracking({
                    sessionId: newSessionId,
                    sessionStart: now,
                    waitlistSessionCount: 0 // Reset session count for new session
                });

                return newSessionId;
            }

            console.log('TradeVision AI: Using existing session:', waitlistTracking.sessionId);
            return waitlistTracking.sessionId;
        } catch (error) {
            console.error('TradeVision AI: Error initializing session:', error);
            // Return a fallback session ID
            return generateSessionId();
        }
    }

    // Reset review tracking for existing users (migration helper)
    async resetReviewTrackingForMigration() {
        console.log('TradeVision AI: Resetting review tracking for migration to queue-based system');
        try {
            // Get current analysis count to preserve it
            const currentTracking = await this.getReviewTracking();
            const analysisCount = currentTracking.analysisCount || 0;

            // Calculate next milestone based on current count
            const nextMilestone = getNextReviewMilestone(analysisCount);

            // Reset all review flags but keep analysis count
            await this.setLocalData({
                analysisCount,
                currentReviewMilestone: null,
                nextReviewMilestone: nextMilestone,
                pendingReviewPrompt: false,
                reviewPromptShownCount: 0,
                lastReviewPromptShown: null,
                reviewClicked: false,
                reviewClickedAt: null,
                reviewPromptDismissedAt: null,
                // Remove old fields
                hasSeenReviewPrompt: undefined,
                reviewReminderCount: undefined,
                reviewReminderDate: undefined,
                pendingReviewType: undefined,
                pendingReviewCount: undefined,
                promptShownCount: undefined,
                lastPromptShown: undefined
            });

            console.log('TradeVision AI: Review tracking reset complete. Analysis count preserved:', analysisCount, 'Next milestone:', nextMilestone);
            return true;
        } catch (error) {
            console.error('TradeVision AI: Error resetting review tracking:', error);
            return false;
        }
    }
}

/**
 * Custom Storage Error class for better error handling
 */
class StorageError extends Error {
    constructor(message, storageType, originalError = null) {
        // Include the original error message if available
        let originalErrorMessage = '';
        if (originalError) {
            if (typeof originalError === 'string') {
                originalErrorMessage = originalError;
            } else if (originalError.message) {
                originalErrorMessage = originalError.message;
            } else {
                originalErrorMessage = String(originalError);
            }
        }
        const fullMessage = originalError ? `${message} (Original error: ${originalErrorMessage})` : message;
        super(fullMessage);
        this.name = 'StorageError';
        this.storageType = storageType;
        this.originalError = originalError;
        this.timestamp = Date.now();
    }
}

/**
 * Global storage utility instance
 */
// Guard against multiple loads - only create instance if not already created
let storageUtils;

if (typeof window !== 'undefined' && window.tradeVisionStorage) {
    console.log('TradeVision AI: storage-utils.js already loaded, reusing existing instance');
    storageUtils = window.tradeVisionStorage;
} else if (typeof self !== 'undefined' && self.tradeVisionStorage) {
    console.log('TradeVision AI: storage-utils.js already loaded in service worker, reusing existing instance');
    storageUtils = self.tradeVisionStorage;
} else {
    console.log('TradeVision AI: Creating new StorageUtils instance');
    storageUtils = new StorageUtils();
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { storageUtils, StorageError };
} else {
    // For browser environment - assign to global scope appropriately
    if (typeof window !== 'undefined') {
        window.tradeVisionStorage = storageUtils;
        console.log('TradeVision AI: Exported storageUtils to window.tradeVisionStorage');
    } else if (typeof self !== 'undefined') {
        // For service worker context (background.js)
        self.tradeVisionStorage = storageUtils;
        console.log('TradeVision AI: Exported storageUtils to self.tradeVisionStorage');
    }
}
