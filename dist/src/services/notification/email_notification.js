"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendNotificationInternal = exports.sendEmailNotification = exports.sendNotification = void 0;
const supabase_1 = require("../supabase");
const withAuth_1 = require("../../lib/withAuth");
const resend_1 = require("resend");
const types_1 = require("../../types");
const logger_1 = require("../../../src/lib/logger");
const slack_1 = require("../alerts/slack");
const notification_string_1 = require("./notification_string");
const redlock_1 = require("../redlock");
const emailTemplates = {
    [types_1.NotificationType.APPROACHING_LIMIT]: {
        subject: "You've used 80% of your credit limit - Firecrawl",
        html: "Hey there,<br/><p>You are approaching your credit limit for this billing period. Your usage right now is around 80% of your total credit limit. Consider upgrading your plan to avoid hitting the limit. Check out our <a href='https://firecrawl.dev/pricing'>pricing page</a> for more info.</p><br/>Thanks,<br/>Firecrawl Team<br/>",
    },
    [types_1.NotificationType.LIMIT_REACHED]: {
        subject: "Credit Limit Reached! Take action now to resume usage - Firecrawl",
        html: "Hey there,<br/><p>You have reached your credit limit for this billing period. To resume usage, please upgrade your plan. Check out our <a href='https://firecrawl.dev/pricing'>pricing page</a> for more info.</p><br/>Thanks,<br/>Firecrawl Team<br/>",
    },
    [types_1.NotificationType.RATE_LIMIT_REACHED]: {
        subject: "Rate Limit Reached - Firecrawl",
        html: "Hey there,<br/><p>You've hit one of the Firecrawl endpoint's rate limit! Take a breather and try again in a few moments. If you need higher rate limits, consider upgrading your plan. Check out our <a href='https://firecrawl.dev/pricing'>pricing page</a> for more info.</p><p>If you have any questions, feel free to reach out to us at <a href='mailto:help@firecrawl.com'>help@firecrawl.com</a></p><br/>Thanks,<br/>Firecrawl Team<br/><br/>Ps. this email is only sent once every 7 days if you reach a rate limit.",
    },
    [types_1.NotificationType.AUTO_RECHARGE_SUCCESS]: {
        subject: "Auto recharge successful - Firecrawl",
        html: "Hey there,<br/><p>Your account was successfully recharged with 1000 credits because your remaining credits were below the threshold. Consider upgrading your plan at <a href='https://firecrawl.dev/pricing'>firecrawl.dev/pricing</a> to avoid hitting the limit.</p><br/>Thanks,<br/>Firecrawl Team<br/>",
    },
    [types_1.NotificationType.AUTO_RECHARGE_FAILED]: {
        subject: "Auto recharge failed - Firecrawl",
        html: "Hey there,<br/><p>Your auto recharge failed. Please try again manually. If the issue persists, please reach out to us at <a href='mailto:help@firecrawl.com'>help@firecrawl.com</a></p><br/>Thanks,<br/>Firecrawl Team<br/>",
    },
};
async function sendNotification(team_id, notificationType, startDateString, endDateString, chunk, bypassRecentChecks = false) {
    return (0, withAuth_1.withAuth)(sendNotificationInternal, undefined)(team_id, notificationType, startDateString, endDateString, chunk, bypassRecentChecks);
}
exports.sendNotification = sendNotification;
async function sendEmailNotification(email, notificationType) {
    const resend = new resend_1.Resend(process.env.RESEND_API_KEY);
    try {
        const { data, error } = await resend.emails.send({
            from: "Firecrawl <firecrawl@getmendableai.com>",
            to: [email],
            reply_to: "help@firecrawl.com",
            subject: emailTemplates[notificationType].subject,
            html: emailTemplates[notificationType].html,
        });
        if (error) {
            logger_1.logger.debug(`Error sending email: ${error}`);
            return { success: false };
        }
    }
    catch (error) {
        logger_1.logger.debug(`Error sending email (2): ${error}`);
        return { success: false };
    }
}
exports.sendEmailNotification = sendEmailNotification;
async function sendNotificationInternal(team_id, notificationType, startDateString, endDateString, chunk, bypassRecentChecks = false) {
    if (team_id === "preview") {
        return { success: true };
    }
    return await redlock_1.redlock.using([`notification-lock:${team_id}:${notificationType}`], 5000, async () => {
        if (!bypassRecentChecks) {
            const fifteenDaysAgo = new Date();
            fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);
            const { data, error } = await supabase_1.supabase_service
                .from("user_notifications")
                .select("*")
                .eq("team_id", team_id)
                .eq("notification_type", notificationType)
                .gte("sent_date", fifteenDaysAgo.toISOString());
            if (error) {
                logger_1.logger.debug(`Error fetching notifications: ${error}`);
                return { success: false };
            }
            if (data.length !== 0) {
                return { success: false };
            }
            // TODO: observation: Free credits people are not receiving notifications
            const { data: recentData, error: recentError } = await supabase_1.supabase_service
                .from("user_notifications")
                .select("*")
                .eq("team_id", team_id)
                .eq("notification_type", notificationType)
                .gte("sent_date", startDateString)
                .lte("sent_date", endDateString);
            if (recentError) {
                logger_1.logger.debug(`Error fetching recent notifications: ${recentError.message}`);
                return { success: false };
            }
            if (recentData.length !== 0) {
                return { success: false };
            }
        }
        console.log(`Sending notification for team_id: ${team_id} and notificationType: ${notificationType}`);
        // get the emails from the user with the team_id
        const { data: emails, error: emailsError } = await supabase_1.supabase_service
            .from("users")
            .select("email")
            .eq("team_id", team_id);
        if (emailsError) {
            logger_1.logger.debug(`Error fetching emails: ${emailsError}`);
            return { success: false };
        }
        for (const email of emails) {
            await sendEmailNotification(email.email, notificationType);
        }
        const { error: insertError } = await supabase_1.supabase_service
            .from("user_notifications")
            .insert([
            {
                team_id: team_id,
                notification_type: notificationType,
                sent_date: new Date().toISOString(),
            },
        ]);
        if (process.env.SLACK_ADMIN_WEBHOOK_URL && emails.length > 0) {
            (0, slack_1.sendSlackWebhook)(`${(0, notification_string_1.getNotificationString)(notificationType)}: Team ${team_id}, with email ${emails[0].email}. Number of credits used: ${chunk.adjusted_credits_used} | Number of credits in the plan: ${chunk.price_credits}`, false, process.env.SLACK_ADMIN_WEBHOOK_URL).catch((error) => {
                logger_1.logger.debug(`Error sending slack notification: ${error}`);
            });
        }
        if (insertError) {
            logger_1.logger.debug(`Error inserting notification record: ${insertError}`);
            return { success: false };
        }
        return { success: true };
    });
}
exports.sendNotificationInternal = sendNotificationInternal;
//# sourceMappingURL=email_notification.js.map