"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = JamoraAnalyticsWidget;
const jsx_runtime_1 = require("react/jsx-runtime");
const react_1 = require("react");
function formatEUR(cents) {
    return new Intl.NumberFormat("en-IE", {
        style: "currency",
        currency: "EUR",
    }).format(cents / 100);
}
function JamoraAnalyticsWidget() {
    const [data, setData] = (0, react_1.useState)(null);
    const [error, setError] = (0, react_1.useState)(false);
    (0, react_1.useEffect)(() => {
        let ignore = false;
        async function load() {
            try {
                const res = await fetch("/api/jamora/analytics/summary");
                if (!res.ok)
                    throw new Error(`Analytics summary failed: ${res.status}`);
                const json = (await res.json());
                if (!ignore)
                    setData(json);
            }
            catch {
                if (!ignore)
                    setError(true);
            }
        }
        void load();
        return () => {
            ignore = true;
        };
    }, []);
    if (error) {
        return ((0, jsx_runtime_1.jsx)("div", { style: { color: "#d02b20", fontSize: 14 }, children: "Analytics could not be loaded." }));
    }
    if (!data) {
        return (0, jsx_runtime_1.jsx)("div", { style: { color: "#666687", fontSize: 14 }, children: "Loading analytics..." });
    }
    const metrics = [
        ["Visits", data.visits.toLocaleString("en-GB")],
        ["Visits today", data.visitsToday.toLocaleString("en-GB")],
        ["Sales", data.sales.toLocaleString("en-GB")],
        ["Omzet", formatEUR(data.revenueCents)],
        ["Today omzet", formatEUR(data.todayRevenueCents)],
        ["Est. profit", formatEUR(data.estimatedProfitCents)],
        ["Est. margin", `${data.estimatedMargin}%`],
    ];
    return ((0, jsx_runtime_1.jsx)("div", { style: {
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 12,
        }, children: metrics.map(([label, value]) => ((0, jsx_runtime_1.jsxs)("div", { style: {
                border: "1px solid #eaeaef",
                borderRadius: 8,
                padding: 12,
                background: "#fff",
            }, children: [(0, jsx_runtime_1.jsx)("div", { style: { color: "#666687", fontSize: 12, fontWeight: 600 }, children: label }), (0, jsx_runtime_1.jsx)("div", { style: { color: "#212134", fontSize: 20, fontWeight: 700 }, children: value })] }, label))) }));
}
