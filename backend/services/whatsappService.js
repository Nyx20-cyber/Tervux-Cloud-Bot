import SessionManager from "./whatsappClient.js";

// Global session manager instance
export const sessionManager = new SessionManager();

/**
 * Initialize the WhatsApp service
 * - Reconnects all active sessions from DB on startup
 */
export async function initWhatsAppService() {
    console.log("🔄 Initializing WhatsApp Service (Multi-Tenant)...");
    await sessionManager.reconnectAll();
    console.log("✅ WhatsApp Service initialized.");
}

/**
 * Graceful shutdown
 */
export async function shutdownWhatsAppService() {
    await sessionManager.shutdownAll();
}
