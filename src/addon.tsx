import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { AddonContext, AddonRouteRenderContext } from "@wealthfolio/addon-sdk";
import { ImportPage } from "./ImportPage";
import { SettingsPage } from "./SettingsPage";

const ADDON_ID = "trade-republic-importer";

function ImportWrapper({ ctx }: { ctx: AddonContext }) {
  return (
    <div className="space-y-0">
      <Nav ctx={ctx} />
      <ImportPage ctx={ctx} />
    </div>
  );
}

function SettingsWrapper({ ctx }: { ctx: AddonContext }) {
  return (
    <div className="space-y-0">
      <Nav ctx={ctx} />
      <SettingsPage ctx={ctx} />
    </div>
  );
}

export default function enable(ctx: AddonContext) {
  const sidebarItem = ctx.sidebar.addItem({
    id: ADDON_ID,
    label: "Trade Republic",
    icon: "bank",
    route: `/addon/${ADDON_ID}`,
    order: 100,
  });

  // The sandbox hands every route the same DOM node (one container per addon,
  // not per route), so all routes must share a single React root — creating
  // more than one root on that node leaves earlier roots' content in place
  // and silently breaks rendering of whichever route mounts second.
  let root: Root | null = null;
  const renderInto = (jsx: ReactElement, { root: routeRoot }: AddonRouteRenderContext) => {
    root ??= createRoot(routeRoot);
    root.render(jsx);
  };

  ctx.router.add({
    path: `/addon/${ADDON_ID}`,
    render: (context) => renderInto(<ImportWrapper ctx={ctx} />, context),
  });

  ctx.router.add({
    path: `/addon/${ADDON_ID}/import`,
    render: (context) => renderInto(<ImportWrapper ctx={ctx} />, context),
  });

  ctx.router.add({
    path: `/addon/${ADDON_ID}/settings`,
    render: (context) => renderInto(<SettingsWrapper ctx={ctx} />, context),
  });

  ctx.onDisable(() => {
    root?.unmount();
    root = null;
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
