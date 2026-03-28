export const DEFAULT_COIN_PLANS = [
    {
        name: "1 Day",
        slug: "3-coins",
        price: 200,
        currency: "TZS",
        coinsAmount: 3,
        description: "Enough to deploy 1 bot for 1 day"
    },
    {
        name: "3 Days",
        slug: "6-coins",
        price: 350,
        currency: "TZS",
        coinsAmount: 6,
        description: "Enough to deploy 1 bot for 3 days"
    },
    {
        name: "7 Days",
        slug: "12-coins",
        price: 600,
        currency: "TZS",
        coinsAmount: 12,
        description: "Enough to deploy 1 bot for 7 days"
    }
];

const LEGACY_PLAN_METADATA = {
    "3-coins": {
        names: ["3 Coins", "Starter"],
        descriptions: [
            "Starter top-up for a 1-day bot",
            "Good for trying a bot with a very small budget",
            "3 coins for one 1-day deployment"
        ]
    },
    "6-coins": {
        names: ["6 Coins", "Lite"],
        descriptions: [
            "Small top-up for a 3-day bot",
            "A simple top-up for short bot use",
            "6 coins for one 3-day deployment"
        ]
    },
    "12-coins": {
        names: ["12 Coins", "Weekly"],
        descriptions: [
            "Easy start for a 7-day bot",
            "A good fit for a full 7-day deployment",
            "12 coins for one 7-day deployment"
        ]
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

export async function syncDefaultPlans(Plan, { overwriteExisting = false } = {}) {
    const created = [];
    const updated = [];
    const retired = [];

    for (const plan of DEFAULT_COIN_PLANS) {
        const existing = await Plan.findOne({ slug: plan.slug }).select("_id").lean();

        if (!existing) {
            await Plan.create(plan);
            created.push(plan.slug);
            continue;
        }

        if (overwriteExisting) {
            await Plan.findOneAndUpdate(
                { slug: plan.slug },
                plan,
                { returnDocument: "after" }
            );
            updated.push(plan.slug);
            continue;
        }

        const legacy = LEGACY_PLAN_METADATA[plan.slug] || { names: [], descriptions: [] };
        const nextFields = {};

        if (!existing.name || legacy.names.includes(existing.name)) {
            nextFields.name = plan.name;
        }

        if (!existing.description || legacy.descriptions.includes(existing.description)) {
            nextFields.description = plan.description;
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

        await Plan.findOneAndUpdate(
            { slug },
            { $set: { isActive: false } },
            { returnDocument: "after" }
        );
        retired.push(slug);
    }

    return { created, updated, retired };
}
