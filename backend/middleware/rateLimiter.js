import rateLimit from "express-rate-limit";

/**
 * Rate limiters for different endpoint categories
 */

// Auth routes: 10 requests per 15 minutes per IP
export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many attempts. Please try again in 15 minutes." }
});

// General API: 100 requests per minute per IP
export const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests. Please slow down." }
});

// Pairing endpoint: 5 requests per 10 minutes per IP
export const pairingLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many pairing attempts. Please try again later." }
});
