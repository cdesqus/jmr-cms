const ORDER_STATUS_TABS = [
  { id: "all", label: "All", statuses: ["pending", "paid", "processing", "shipped", "fulfilled", "failed", "refunded"] },
  { id: "pending", label: "Pending", statuses: ["pending"] },
  { id: "paid", label: "Paid", statuses: ["paid"] },
  { id: "processing", label: "Processing", statuses: ["processing"] },
  { id: "shipped", label: "Shipped", statuses: ["shipped"] },
  { id: "fulfilled", label: "Fulfilled", statuses: ["fulfilled"] },
  { id: "failed", label: "Failed", statuses: ["failed"] },
  { id: "refunded", label: "Refunded", statuses: ["refunded"] },
];

function filterOrdersByStatus(orders, tabId, query = "") {
  const tab = ORDER_STATUS_TABS.find((candidate) => candidate.id === tabId) ?? ORDER_STATUS_TABS[0];
  const needle = String(query).trim().toLowerCase();
  return orders.filter((order) => {
    const haystack = [order.orderNumber, order.customerName, order.email, order.trackingNumber].filter(Boolean).join(" ").toLowerCase();
    return tab.statuses.includes(order.status) && (!needle || haystack.includes(needle));
  });
}

module.exports = { ORDER_STATUS_TABS, filterOrdersByStatus };
