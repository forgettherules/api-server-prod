"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.autoCharge = void 0;
const auth_1 = require("../../controllers/auth");
const redlock_1 = require("../redlock");
const supabase_1 = require("../supabase");
const stripe_1 = require("./stripe");
const issue_credits_1 = require("./issue_credits");
const email_notification_1 = require("../notification/email_notification");
const types_1 = require("../../types");
const redis_1 = require("../redis");
const slack_1 = require("../alerts/slack");
const logger_1 = require("../../lib/logger");
// Define the number of credits to be added during auto-recharge
const AUTO_RECHARGE_CREDITS = 1000;
const AUTO_RECHARGE_COOLDOWN = 300; // 5 minutes in seconds
/**
 * Attempt to automatically charge a user's account when their credit balance falls below a threshold
 * @param chunk The user's current usage data
 * @param autoRechargeThreshold The credit threshold that triggers auto-recharge
 */
async function autoCharge(chunk, autoRechargeThreshold) {
    const resource = `auto-recharge:${chunk.team_id}`;
    const cooldownKey = `auto-recharge-cooldown:${chunk.team_id}`;
    try {
        // Check if the team is in the cooldown period
        // Another check to prevent race conditions, double charging - cool down of 5 minutes
        const cooldownValue = await (0, redis_1.getValue)(cooldownKey);
        if (cooldownValue) {
            logger_1.logger.info(`Auto-recharge for team ${chunk.team_id} is in cooldown period`);
            return {
                success: false,
                message: "Auto-recharge is in cooldown period",
                remainingCredits: chunk.remaining_credits,
                chunk,
            };
        }
        // Use a distributed lock to prevent concurrent auto-charge attempts
        return await redlock_1.redlock.using([resource], 5000, async (signal) => {
            // Recheck the condition inside the lock to prevent race conditions
            const updatedChunk = await (0, auth_1.getACUC)(chunk.api_key, false, false);
            if (updatedChunk &&
                updatedChunk.remaining_credits < autoRechargeThreshold) {
                if (chunk.sub_user_id) {
                    // Fetch the customer's Stripe information
                    const { data: customer, error: customersError } = await supabase_1.supabase_service
                        .from("customers")
                        .select("id, stripe_customer_id")
                        .eq("id", chunk.sub_user_id)
                        .single();
                    if (customersError) {
                        logger_1.logger.error(`Error fetching customer data: ${customersError}`);
                        return {
                            success: false,
                            message: "Error fetching customer data",
                            remainingCredits: chunk.remaining_credits,
                            chunk,
                        };
                    }
                    if (customer && customer.stripe_customer_id) {
                        let issueCreditsSuccess = false;
                        // Attempt to create a payment intent
                        const paymentStatus = await (0, stripe_1.createPaymentIntent)(chunk.team_id, customer.stripe_customer_id);
                        // If payment is successful or requires further action, issue credits
                        if (paymentStatus.return_status === "succeeded" ||
                            paymentStatus.return_status === "requires_action") {
                            issueCreditsSuccess = await (0, issue_credits_1.issueCredits)(chunk.team_id, AUTO_RECHARGE_CREDITS);
                        }
                        // Record the auto-recharge transaction
                        await supabase_1.supabase_service.from("auto_recharge_transactions").insert({
                            team_id: chunk.team_id,
                            initial_payment_status: paymentStatus.return_status,
                            credits_issued: issueCreditsSuccess ? AUTO_RECHARGE_CREDITS : 0,
                            stripe_charge_id: paymentStatus.charge_id,
                        });
                        // Send a notification if credits were successfully issued
                        if (issueCreditsSuccess) {
                            await (0, email_notification_1.sendNotification)(chunk.team_id, types_1.NotificationType.AUTO_RECHARGE_SUCCESS, chunk.sub_current_period_start, chunk.sub_current_period_end, chunk, true);
                            // Set cooldown period
                            await (0, redis_1.setValue)(cooldownKey, 'true', AUTO_RECHARGE_COOLDOWN);
                        }
                        // Reset ACUC cache to reflect the new credit balance
                        const cacheKeyACUC = `acuc_${chunk.api_key}`;
                        await (0, redis_1.deleteKey)(cacheKeyACUC);
                        if (process.env.SLACK_ADMIN_WEBHOOK_URL) {
                            const webhookCooldownKey = `webhook_cooldown_${chunk.team_id}`;
                            const isInCooldown = await (0, redis_1.getValue)(webhookCooldownKey);
                            if (!isInCooldown) {
                                (0, slack_1.sendSlackWebhook)(`Auto-recharge: Team ${chunk.team_id}. ${AUTO_RECHARGE_CREDITS} credits added. Payment status: ${paymentStatus.return_status}.`, false, process.env.SLACK_ADMIN_WEBHOOK_URL).catch((error) => {
                                    logger_1.logger.debug(`Error sending slack notification: ${error}`);
                                });
                                // Set cooldown for 1 hour
                                await (0, redis_1.setValue)(webhookCooldownKey, 'true', 60 * 60);
                            }
                        }
                        return {
                            success: true,
                            message: "Auto-recharge successful",
                            remainingCredits: chunk.remaining_credits + AUTO_RECHARGE_CREDITS,
                            chunk: { ...chunk, remaining_credits: chunk.remaining_credits + AUTO_RECHARGE_CREDITS },
                        };
                    }
                    else {
                        logger_1.logger.error("No Stripe customer ID found for user");
                        return {
                            success: false,
                            message: "No Stripe customer ID found for user",
                            remainingCredits: chunk.remaining_credits,
                            chunk,
                        };
                    }
                }
                else {
                    logger_1.logger.error("No sub_user_id found in chunk");
                    return {
                        success: false,
                        message: "No sub_user_id found in chunk",
                        remainingCredits: chunk.remaining_credits,
                        chunk,
                    };
                }
            }
            return {
                success: false,
                message: "No need to auto-recharge",
                remainingCredits: chunk.remaining_credits,
                chunk,
            };
        });
    }
    catch (error) {
        logger_1.logger.error(`Failed to acquire lock for auto-recharge: ${error}`);
        return {
            success: false,
            message: "Failed to acquire lock for auto-recharge",
            remainingCredits: chunk.remaining_credits,
            chunk,
        };
    }
}
exports.autoCharge = autoCharge;
//# sourceMappingURL=auto_charge.js.map