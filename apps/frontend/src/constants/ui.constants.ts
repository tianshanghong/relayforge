// Timing constants (in milliseconds)
export const UI_FEEDBACK_TIMEOUT = 2000; // 2 seconds for UI feedback like "Copied!"
export const API_RETRY_DELAY = 1000; // 1 second initial retry delay
export const API_MAX_RETRIES = 3;

// Input validation constants
export const TOKEN_NAME_MIN_LENGTH = 1;
export const TOKEN_NAME_MAX_LENGTH = 100;

// Duplicate prevention constants
export const DUPLICATE_PREVENTION_WINDOW = 5000; // 5 seconds

// Session constants
export const SESSION_CHECK_INTERVAL = 60000; // 1 minute
export const SESSION_REFRESH_THRESHOLD = 300000; // 5 minutes before expiry