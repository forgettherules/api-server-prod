"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.keyAuthController = void 0;
const auth_1 = require("../auth");
const keyAuthController = async (req, res) => {
    try {
        // make sure to authenticate user first, Bearer <token>
        const auth = await (0, auth_1.authenticateUser)(req, res);
        if (!auth.success) {
            return res.status(auth.status).json({ error: auth.error });
        }
        // if success, return success: true
        return res.status(200).json({ success: true });
    }
    catch (error) {
        return res.status(500).json({ error: error.message });
    }
};
exports.keyAuthController = keyAuthController;
//# sourceMappingURL=keyAuth.js.map