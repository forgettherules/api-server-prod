"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.acucCacheClearController = void 0;
const supabase_1 = require("../../../services/supabase");
const auth_1 = require("../../auth");
const logger_1 = require("../../../lib/logger");
async function acucCacheClearController(req, res) {
    try {
        const team_id = req.body.team_id;
        const keys = await supabase_1.supabase_service
            .from("api_keys")
            .select("*")
            .eq("team_id", team_id);
        await Promise.all((keys.data ?? []).map((x) => (0, auth_1.clearACUC)(x.key)));
        res.json({ ok: true });
    }
    catch (error) {
        logger_1.logger.error(`Error clearing ACUC cache via API route: ${error}`);
        res.status(500).json({ error: "Internal server error" });
    }
}
exports.acucCacheClearController = acucCacheClearController;
//# sourceMappingURL=acuc-cache-clear.js.map