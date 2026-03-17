export const VIP_DEPLOYMENT_THRESHOLD = 50;
export const VIP_TOTAL_COINS_SPENT_THRESHOLD = 10000;
export const VIP_TOTAL_REFERRALS_THRESHOLD = 100;
export const BOT_MASTER_DEPLOYMENT_THRESHOLD = 10;

export function shouldHaveVipFromDeployments(totalDeployments = 0) {
    return Number(totalDeployments || 0) >= VIP_DEPLOYMENT_THRESHOLD;
}

export function shouldHaveVip({
    totalDeployments = 0,
    totalCoinsSpent = 0,
    totalReferrals = 0
} = {}) {
    return (
        Number(totalDeployments || 0) >= VIP_DEPLOYMENT_THRESHOLD ||
        Number(totalCoinsSpent || 0) >= VIP_TOTAL_COINS_SPENT_THRESHOLD ||
        Number(totalReferrals || 0) >= VIP_TOTAL_REFERRALS_THRESHOLD
    );
}

export function syncVipFlagOnUser(user) {
    if (!user) return false;
    const shouldBeVip = shouldHaveVip({
        totalDeployments: user.totalDeployments,
        totalCoinsSpent: user.totalCoinsSpent,
        totalReferrals: user.totalReferrals
    });
    if (user.isVIP !== shouldBeVip) {
        user.isVIP = shouldBeVip;
        return true;
    }
    return false;
}
