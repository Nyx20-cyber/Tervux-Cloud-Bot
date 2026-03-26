export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function launchBackgroundSequence(sock, label, runner, options = {}) {
    const sessionId = String(sock?.sessionId || "");
    const manager = sock?.__sessionManager;
    const backlogLimit = Number(options.backlogLimit || 12);

    const execute = async () => {
        try {
            await runner();
        } catch (error) {
            console.error(`[FunBackground] ${label} failed:`, error.message);
        }
    };

    if (manager?.enqueueLowPriorityTask && sessionId) {
        manager.enqueueLowPriorityTask(sessionId, `fun:${label}`, execute, { backlogLimit });
        return true;
    }

    Promise.resolve().then(execute);
    return false;
}
