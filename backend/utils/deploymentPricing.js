export const DEPLOYMENT_OPTIONS = [
    { days: 1, baseCost: 3 },
    { days: 3, baseCost: 6 },
    { days: 7, baseCost: 12 }
];

export const VALID_DEPLOYMENT_DURATIONS = DEPLOYMENT_OPTIONS.map((option) => option.days);

export function isValidDeploymentDuration(days) {
    return VALID_DEPLOYMENT_DURATIONS.includes(Number(days));
}

export function getDeploymentBaseCost(days) {
    const option = DEPLOYMENT_OPTIONS.find((entry) => entry.days === Number(days));
    return option ? option.baseCost : null;
}

export function getDeploymentCost(days, isVIP = false) {
    const baseCost = getDeploymentBaseCost(days);
    if (!Number.isFinite(baseCost)) return baseCost; // Return null for invalid options to be handled by caller
    const cost = isVIP ? Math.max(1, baseCost - 2) : baseCost;
    return Number.isFinite(cost) ? cost : baseCost;
}

export function getDeploymentDurationMs(days) {
    return Number(days) * 24 * 60 * 60 * 1000;
}

export function getDeploymentExamplesForCoins(coins, isVIP = false) {
    return DEPLOYMENT_OPTIONS.map((option) => {
        const cost = getDeploymentCost(option.days, isVIP);
        const finalCost = Number.isFinite(cost) ? cost : option.baseCost;
        return {
            ...option,
            cost: finalCost,
            count: Math.floor(Number(coins || 0) / Math.max(finalCost || 1, 1))
        };
    });
}

export function getDeploymentReminderThresholdsMs(days) {
    const normalized = Number(days || 30);
    if (normalized <= 1) {
        return [6 * 60 * 60 * 1000];
    }
    if (normalized <= 3) {
        return [24 * 60 * 60 * 1000];
    }
    return [48 * 60 * 60 * 1000, 24 * 60 * 60 * 1000];
}
