import React from "react";
import type { AddonContext } from "@wealthfolio/addon-sdk";
import { ImportPage } from "./ImportPage";
import { SettingsPage } from "./SettingsPage";

function TrIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="12" fill="#0EE4A1" />
      <text
        x="12"
        y="16"
        textAnchor="middle"
        fontSize="9"
        fontWeight="bold"
        fontFamily="sans-serif"
        fill="#0A0A0A"
      >
        TR
      </text>
    </svg>
  );
}

const ADDON_ID = "trade-republic-importer";

export default function enable(ctx: AddonContext) {
  const sidebarItem = ctx.sidebar.addItem({
    id: ADDON_ID,
    label: "Trade Republic",
    icon: <TrIcon className="h-5 w-5" />,
    route: `/addon/${ADDON_ID}`,
    order: 100,
  });

  const ImportWrapper = () => (
    <div className="space-y-0">
      <Nav ctx={ctx} />
      <ImportPage ctx={ctx} />
    </div>
  );

  const SettingsWrapper = () => (
    <div className="space-y-0">
      <Nav ctx={ctx} />
      <SettingsPage ctx={ctx} />
    </div>
  );

  ctx.router.add({
    path: `/addon/${ADDON_ID}`,
    component: React.lazy(() => Promise.resolve({ default: ImportWrapper })),
  });

  ctx.router.add({
    path: `/addon/${ADDON_ID}/import`,
    component: React.lazy(() => Promise.resolve({ default: ImportWrapper })),
  });

  ctx.router.add({
    path: `/addon/${ADDON_ID}/settings`,
    component: React.lazy(() => Promise.resolve({ default: SettingsWrapper })),
  });

  ctx.onDisable(() => {
    try {
      sidebarItem.remove();
    } catch (e) {
      ctx.api.logger.error(`[${ADDON_ID}] Failed to remove sidebar item: ${e}`);
    }
  });
}

function Nav({ ctx }: { ctx: AddonContext }) {
  const current = typeof window !== "undefined" ? window.location.pathname : "";
  const base = `/addon/${ADDON_ID}`;

  const link = (path: string, label: string) => {
    const active = current === path || (path === `${base}/import` && current === base);
    return (
      <button
        onClick={() => ctx.api.navigation.navigate(path)}
        className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
          active
            ? "bg-primary text-primary-foreground font-medium"
            : "text-muted-foreground hover:text-foreground hover:bg-muted"
        }`}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="flex items-center gap-1 px-6 pb-2 pt-6">
      {link(`${base}/import`, "Import")}
      {link(`${base}/settings`, "Settings")}
    </div>
  );
}
