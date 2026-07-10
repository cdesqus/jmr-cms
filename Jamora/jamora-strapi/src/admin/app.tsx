import type { StrapiApp } from "@strapi/admin/strapi-admin";

const AnalyticsIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
    <rect x="3" y="4" width="18" height="16" rx="4" fill="#4945FF" />
    <path d="M8 16V12M12 16V8M16 16V10" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export default {
  register(app: StrapiApp) {
    if ("widgets" in app) {
      app.widgets.register({
        id: "jamora-analytics",
        icon: AnalyticsIcon,
        title: {
          id: "jamora.analytics.title",
          defaultMessage: "Jamora Analytics",
        },
        component: async () => {
          const component = await import("./components/JamoraAnalyticsWidget");
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
  bootstrap() {},
};
