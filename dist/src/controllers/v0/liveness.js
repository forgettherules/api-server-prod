"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.livenessController = void 0;
async function livenessController(req, res) {
    //TODO: add checks if the application is live and healthy like checking the redis connection
    res.status(200).json({ status: "ok" });
}
exports.livenessController = livenessController;
//# sourceMappingURL=liveness.js.map