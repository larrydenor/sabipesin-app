const Subscription = require('../models/Subscription');

// GET /subscriptions/me
// Read-only snapshot of the authenticated user's subscription (spec §6, §7).
// Makes no payment call — it only reads what the subscribe/verify slices have
// persisted. A user who has never subscribed has no Subscription row, so we
// default to the free plan rather than writing a free-tier row on signup.
async function getMe(req, res) {
    const subscription = await Subscription.findOne({ userId: req.userId })
        .select('plan status paymentPlatform currentPeriodEnd')
        .lean();

    // No row yet → free plan. `status: 'active'` here means "the free tier is in
    // effect," not a paid subscription; currentPeriodEnd is null because free
    // never expires. This mirrors the schema defaults (plan 'free', status
    // 'active') so a defaulted response and a real free-tier row read the same.
    if (!subscription) {
        return res.json({
            plan: 'free',
            status: 'active',
            paymentPlatform: null,
            currentPeriodEnd: null,
        });
    }

    return res.json({
        plan: subscription.plan,
        status: subscription.status,
        paymentPlatform: subscription.paymentPlatform ?? null,
        currentPeriodEnd: subscription.currentPeriodEnd ?? null,
    });
}

module.exports = {
    getMe,
};
