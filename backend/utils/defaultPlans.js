export const DEFAULT_COIN_PLANS = [
    {
        name: "Starter",
        slug: "3-coins",
        price: 500,
        currency: "TZS",
        coinsAmount: 10,
        description: "Up to 3 one-day deploys or 1 three-day deploy"
    },
    {
        name: "Plus",
        slug: "6-coins",
        price: 1000,
        currency: "TZS",
        coinsAmount: 20,
        description: "Up to 1 seven-day + 1 three-day deploy"
    },
    {
        name: "Pro",
        slug: "12-coins",
        price: 1500,
        currency: "TZS",
        coinsAmount: 30,
        description: "Up to 2 seven-day + 2 one-day deploys"
    }
];

const LEGACY_PLAN_METADATA = {
    "3-coins": {
        names: ["3 Coins", "Starter", "1 Day"],
        descriptions: [
            "Starter top-up for a 1-day bot",
            "Good for trying a bot with a very small budget",
            "3 coins for one 1-day deployment",
            "Enough to deploy 1 bot for 1 day"
        ],
        prices: [200],
        coinsAmounts: [3],
        currencies: ["TZS"]
    },
    "6-coins": {
        names: ["6 Coins", "Lite", "3 Days"],
        descriptions: [
            "Small top-up for a 3-day bot",
            "A simple top-up for short bot use",
            "6 coins for one 3-day deployment",
            "Enough to deploy 1 bot for 3 days"
        ],
        prices: [350],
        coinsAmounts: [6],
        currencies: ["TZS"]
    },
    "12-coins": {
        names: ["12 Coins", "Weekly", "7 Days"],
        descriptions: [
            "Easy start for a 7-day bot",
            "A good fit for a full 7-day deployment",
            "12 coins for one 7-day deployment",
            "Enough to deploy 1 bot for 7 days"
        ],
        prices: [600],
        coinsAmounts: [12],
        currencies: ["TZS"]
    },
    "50-coins": {
        names: ["50 Coins", "Standard"],
        descriptions: ["50 Coins — Deploy 1 Bot", "Good for regular bot use"],
        price: 1500,
        coinsAmount: 50
    },
    "100-coins": {
        names: ["100 Coins", "Pro"],
        descriptions: ["100 Coins — Deploy 2 Bots", "Better value for multiple bots"],
        price: 2000,
        coinsAmount: 100
    },
    "250-coins": {
        names: ["250 Coins", "Mega"],
        descriptions: ["250 Coins — Deploy 5 Bots", "Best value for heavy usage"],
        price: 3000,
        coinsAmount: 250
    }
};

const RETIRED_DEFAULT_PLAN_SLUGS = ["50-coins", "100-coins", "250-coins"];

function includesNormalizedText(candidates = [], value = "") {
    const normalized = String(value || "").trim().toLowerCase();
    if (!normalized) return false;
    return candidates.some((entry) => String(entry || "").trim().toLowerCase() === normalized);
}

function includesNormalizedNumber(candidates = [], value) {
    const normalized = Number(value);
    if (!Number.isFinite(normalized)) return false;
    return candidates.some((entry) => Number(entry) === normalized);
}

function looksManagedDefaultPlan(existing = {}, plan = {}) {
    const legacy = LEGACY_PLAN_METADATA[plan.slug] || {};
    return (
        includesNormalizedText([plan.name, ...(legacy.names || [])], existing.name) &&
        includesNormalizedText([plan.description, ...(legacy.descriptions || [])], existing.description) &&
        includesNormalizedNumber([plan.price, ...(legacy.prices || [])], existing.price) &&
        includesNormalizedNumber([plan.coinsAmount, ...(legacy.coinsAmounts || [])], existing.coinsAmount) &&
        includesNormalizedText([plan.currency || "TZS", ...(legacy.currencies || [])], existing.currency || "TZS")
    );
}

async function hasConflictingPlanName(Plan, name, slugToExclude = "") {
    const normalizedName = String(name || "").trim();
    if (!normalizedName) return false;

    const conflict = await Plan.findOne({
        name: normalizedName,
        slug: { $ne: String(slugToExclude || "").trim().toLowerCase() }
    })
        .select("_id slug")
        .lean();

    return Boolean(conflict);
}

export async function syncDefaultPlans(Plan, { overwriteExisting = false } = {}) {
    const created = [];
    const updated = [];
    const retired = [];

    for (const slug of RETIRED_DEFAULT_PLAN_SLUGS) {
        const plan = await Plan.findOne({ slug }).select("isActive name description price coinsAmount").lean();
        if (!plan?.isActive) continue;

        const legacy = LEGACY_PLAN_METADATA[slug] || { names: [], descriptions: [] };
        const looksManagedByDefaults =
            legacy.names.includes(plan.name || "") &&
            legacy.descriptions.includes(plan.description || "") &&
            Number(plan.price) === Number(legacy.price) &&
            Number(plan.coinsAmount) === Number(legacy.coinsAmount);

        if (!looksManagedByDefaults) continue;

        const retiredName = `${String(plan.name || slug).trim()} [retired:${slug}]`;

        await Plan.findOneAndUpdate(
            { slug },
            {
                $set: {
                    isActive: false,
                    name: retiredName
                }
            },
            { returnDocument: "after" }
        );
        retired.push(slug);
    }

    for (const plan of DEFAULT_COIN_PLANS) {
        const existing = await Plan.findOne({ slug: plan.slug })
            .select("_id name description price coinsAmount currency isActive")
            .lean();

        if (!existing) {
            const createPayload = { ...plan };
            if (await hasConflictingPlanName(Plan, createPayload.name, createPayload.slug)) {
                createPayload.name = `${createPayload.name} Plan`;
            }

            await Plan.create(createPayload);
            created.push(plan.slug);
            continue;
        }

        if (overwriteExisting) {
            const updatePayload = { ...plan };
            if (await hasConflictingPlanName(Plan, updatePayload.name, plan.slug)) {
                delete updatePayload.name;
            }
            await Plan.findOneAndUpdate(
                { slug: plan.slug },
                updatePayload,
                { returnDocument: "after" }
            );
            updated.push(plan.slug);
            continue;
        }

        const legacy = LEGACY_PLAN_METADATA[plan.slug] || { names: [], descriptions: [] };
        const nextFields = looksManagedDefaultPlan(existing, plan)
            ? { ...plan, isActive: true }
            : {};

        if (!nextFields.name && (!existing.name || legacy.names.includes(existing.name))) {
            nextFields.name = plan.name;
        }

        if (!nextFields.description && (!existing.description || legacy.descriptions.includes(existing.description))) {
            nextFields.description = plan.description;
        }

        if (nextFields.name && await hasConflictingPlanName(Plan, nextFields.name, plan.slug)) {
            delete nextFields.name;
        }

        if (Object.keys(nextFields).length > 0) {
            await Plan.findOneAndUpdate(
                { slug: plan.slug },
                { $set: nextFields },
                { returnDocument: "after" }
            );
            updated.push(plan.slug);
        }
    }

    return { created, updated, retired };
}
