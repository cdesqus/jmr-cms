"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const jsx_runtime_1 = require("react/jsx-runtime");
const AnalyticsIcon = () => ((0, jsx_runtime_1.jsxs)("svg", { width: "24", height: "24", viewBox: "0 0 24 24", fill: "none", "aria-hidden": true, children: [(0, jsx_runtime_1.jsx)("rect", { x: "3", y: "4", width: "18", height: "16", rx: "4", fill: "#4945FF" }), (0, jsx_runtime_1.jsx)("path", { d: "M8 16V12M12 16V8M16 16V10", stroke: "#fff", strokeWidth: "2", strokeLinecap: "round" })] }));
exports.default = {
    register(app) {
        if ("widgets" in app) {
            app.widgets.register({
                id: "jamora-analytics",
                icon: AnalyticsIcon,
                title: {
                    id: "jamora.analytics.title",
                    defaultMessage: "Jamora Analytics",
                },
                component: async () => {
                    const component = await Promise.resolve().then(() => __importStar(require("./components/JamoraAnalyticsWidget")));
                    return component.default;
                },
                link: {
                    label: {
                        id: "jamora.analytics.link",
                        defaultMessage: "Open orders",
                    },
                    href: "/content-manager/collection-types/api::order.order",
                },
            });
        }
    },
    bootstrap() { },
};
