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

// Each route gets its own DOM node from the host, so each needs its own React
// root — created once and reused across re-renders of that route.
function mountRoute(node: () => ReactElement) {
  let root: Root | null = null;
  return {
    render: ({ root: routeRoot }: AddonRouteRenderContext) => {
      root ??= createRoot(routeRoot);
      root.render(node());
    },
    unmount: () => {
      root?.unmount();
      root = null;
    },
  };
}

export default function enable(ctx: AddonContext) {
  const sidebarItem = ctx.sidebar.addItem({
    id: ADDON_ID,
    label: "Trade Republic",
    icon: "bank",
    route: `/addon/${ADDON_ID}`,
    order: 100,
  });

  const importRoute = mountRoute(() => <ImportWrapper ctx={ctx} />);
  const importRouteAlias = mountRoute(() => <ImportWrapper ctx={ctx} />);
  const settingsRoute = mountRoute(() => <SettingsWrapper ctx={ctx} />);

  ctx.router.add({
    path: `/addon/${ADDON_ID}`,
    render: importRoute.render,
  });

  ctx.router.add({
    path: `/addon/${ADDON_ID}/import`,
    render: importRouteAlias.render,
  });

  ctx.router.add({
    path: `/addon/${ADDON_ID}/settings`,
    render: settingsRoute.render,
  });

  ctx.onDisable(() => {
    importRoute.unmount();
    importRouteAlias.unmount();
    settingsRoute.unmount();
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
