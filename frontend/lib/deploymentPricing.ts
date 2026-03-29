export const DEPLOYMENT_OPTIONS = [
  { days: 1, baseCost: 3 },
  { days: 3, baseCost: 6 },
  { days: 7, baseCost: 12 },
] as const;

export type DeploymentDurationDays = (typeof DEPLOYMENT_OPTIONS)[number]["days"];

export function getDeploymentCost(days: number, isVIP = false) {
  const option = DEPLOYMENT_OPTIONS.find((entry) => entry.days === days);
  if (!option) return null;
  const cost = isVIP ? Math.max(1, option.baseCost - 2) : option.baseCost;
  return Number.isFinite(cost) ? cost : option.baseCost;
}

export function getDeploymentExamplesForCoins(coins: number, isVIP = false) {
  return DEPLOYMENT_OPTIONS.map((option) => {
    const cost = getDeploymentCost(option.days, isVIP) ?? option.baseCost;
    return {
      ...option,
      cost: Number.isFinite(cost) ? cost : option.baseCost,
      count: Math.floor((Number(coins) || 0) / Math.max(Number.isFinite(cost) ? cost : option.baseCost, 1)),
    };
  });
}
