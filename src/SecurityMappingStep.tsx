import { useCallback, useEffect, useRef, useState } from "react";
import type { AddonContext, SymbolSearchResult } from "@wealthfolio/addon-sdk";
import { Button, Card, CardContent, Icons, Input } from "@wealthfolio/ui";
import type { SecurityMapping } from "./types";

export type { SecurityMapping } from "./types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SecurityInfo {
  isin: string;
  name: string;
  count: number;
}

// ─── TickerSearchInput ────────────────────────────────────────────────────────

function TickerSearchInput({
  defaultQuery,
  onSelect,
  ctx,
}: {
  defaultQuery: string;
  onSelect: (r: SymbolSearchResult) => void;
  ctx: AddonContext;
}) {
  const [query, setQuery] = useState(defaultQuery);
  const [results, setResults] = useState<SymbolSearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query || query.length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await ctx.api.market.searchTicker(query);
        setResults(res.slice(0, 8));
        setIsOpen(res.length > 0);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, ctx]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={containerRef} className="relative min-w-0 flex-1">
      <div className="relative">
        <Icons.Search className="text-muted-foreground pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search ticker, name or ISIN…"
          className="h-8 pl-7 text-xs"
          onFocus={() => results.length > 0 && setIsOpen(true)}
        />
        {loading && (
          <Icons.Loader className="text-muted-foreground absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin" />
        )}
      </div>
      {isOpen && results.length > 0 && (
        <div className="bg-background absolute top-full z-50 mt-1 w-full overflow-hidden rounded-md border shadow-lg">
          {results.map((r) => (
            <button
              key={r.symbol + r.exchange}
              type="button"
              className="hover:bg-muted flex w-full items-center gap-2 px-3 py-2 text-left text-xs"
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(r);
                setIsOpen(false);
              }}
            >
              <span className="w-20 shrink-0 font-mono font-bold">
                {r.canonicalSymbol || r.symbol}
              </span>
              <span className="text-muted-foreground min-w-0 flex-1 truncate">{r.shortName}</span>
              {r.currency && <span className="text-muted-foreground shrink-0">{r.currency}</span>}
              {r.isExisting && (
                <span className="shrink-0 rounded bg-green-100 px-1 py-0.5 text-[10px] font-semibold text-green-700 dark:bg-green-900/30 dark:text-green-400">
                  Existing
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── SecurityRow ──────────────────────────────────────────────────────────────

function SecurityRow({
  info,
  mapping,
  onMapped,
  onClear,
  ctx,
}: {
  info: SecurityInfo;
  mapping: SecurityMapping | undefined;
  onMapped: (m: SecurityMapping) => void;
  onClear: () => void;
  ctx: AddonContext;
}) {
  return (
    <div className="grid grid-cols-[12rem_1fr_auto] items-center gap-3 border-b px-4 py-3 last:border-0">
      {/* Col 1: ISIN + name + count */}
      <div className="flex min-w-0 flex-col">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xs font-bold">{info.isin || "—"}</span>
          <span className="bg-muted rounded px-1 py-0.5 text-[10px]">{info.count}×</span>
        </div>
        {info.name && (
          <span className="text-muted-foreground truncate text-[11px]">{info.name}</span>
        )}
      </div>

      {/* Col 2: resolution */}
      {mapping === "custom" ? (
        <div className="flex items-center gap-2">
          <span className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300">
            Custom (ISIN as symbol)
          </span>
          <Button size="sm" variant="ghost" className="h-6 px-1.5" onClick={onClear}>
            <Icons.X className="h-3 w-3" />
          </Button>
        </div>
      ) : mapping ? (
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-bold">
            {mapping.canonicalSymbol || mapping.symbol}
          </span>
          <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs">
            {mapping.shortName}
          </span>
          {mapping.currency && (
            <span className="border-border bg-muted/50 shrink-0 rounded border px-1.5 py-0.5 text-[10px]">
              {mapping.currency}
            </span>
          )}
          {mapping.isExisting && (
            <span className="shrink-0 rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700 dark:bg-green-900/30 dark:text-green-400">
              Existing
            </span>
          )}
          <Button size="sm" variant="ghost" className="h-6 shrink-0 px-1.5" onClick={onClear}>
            <Icons.X className="h-3 w-3" />
          </Button>
        </div>
      ) : (
        <TickerSearchInput defaultQuery={info.isin} onSelect={onMapped} ctx={ctx} />
      )}

      {/* Col 3: Mark Custom (only when unresolved) */}
      {!mapping && (
        <Button
          size="sm"
          variant="ghost"
          className="text-muted-foreground h-7 shrink-0 gap-1 px-2 text-[11px] hover:text-amber-700"
          onClick={() => onMapped("custom")}
        >
          <Icons.Tag className="h-3 w-3 shrink-0" />
          <span>Custom</span>
        </Button>
      )}
    </div>
  );
}

// ─── SecurityMappingStep ──────────────────────────────────────────────────────

export function SecurityMappingStep({
  securities,
  ctx,
  mappings,
  onMappingsChange,
  onComplete,
  onBack,
}: {
  securities: SecurityInfo[];
  ctx: AddonContext;
  mappings: Map<string, SecurityMapping>;
  onMappingsChange: (m: Map<string, SecurityMapping>) => void;
  onComplete: (mappings: Map<string, SecurityMapping>) => void;
  onBack: () => void;
}) {
  const allResolved = securities.every((s) => mappings.has(s.isin));
  const unresolvedCount = securities.filter((s) => !mappings.has(s.isin)).length;

  const handleMapped = useCallback(
    (isin: string, m: SecurityMapping) => {
      onMappingsChange(new Map(mappings).set(isin, m));
    },
    [mappings, onMappingsChange],
  );

  const handleClear = useCallback(
    (isin: string) => {
      const next = new Map(mappings);
      next.delete(isin);
      onMappingsChange(next);
    },
    [mappings, onMappingsChange],
  );

  const handleMarkAllCustom = useCallback(() => {
    const next = new Map<string, SecurityMapping>();
    for (const s of securities) next.set(s.isin, "custom");
    onMappingsChange(next);
  }, [securities, onMappingsChange]);

  return (
    <div className="max-w-3xl space-y-4 p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Map Securities</h1>
          <p className="text-muted-foreground mt-0.5 text-sm">
            {securities.length} {securities.length === 1 ? "security" : "securities"} found. Search
            for the correct ticker or mark as custom to keep the ISIN.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" onClick={onBack}>
            Back
          </Button>
          <Button
            variant="outline"
            onClick={handleMarkAllCustom}
            className="border-amber-300 text-amber-700 hover:bg-amber-50 hover:text-amber-800 dark:border-amber-500/40 dark:text-amber-300 dark:hover:bg-amber-500/10"
          >
            <Icons.Tag className="mr-1.5 h-3.5 w-3.5" />
            Mark All Custom
          </Button>
          <Button onClick={() => onComplete(mappings)} disabled={!allResolved}>
            Continue
          </Button>
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {/* Table header */}
          <div className="bg-muted/30 grid grid-cols-[12rem_1fr_auto] gap-3 border-b px-4 py-2">
            {["ISIN / Name", "Map to ticker", ""].map((h) => (
              <span key={h} className="text-muted-foreground text-[11px] font-medium">
                {h}
              </span>
            ))}
          </div>
          {securities.map((s) => (
            <SecurityRow
              key={s.isin}
              info={s}
              mapping={mappings.get(s.isin)}
              onMapped={(m) => handleMapped(s.isin, m)}
              onClear={() => handleClear(s.isin)}
              ctx={ctx}
            />
          ))}
        </CardContent>
      </Card>

      {!allResolved && (
        <p className="text-muted-foreground text-sm">
          {unresolvedCount} {unresolvedCount === 1 ? "security" : "securities"} remaining — resolve
          all or mark as custom to continue.
        </p>
      )}
    </div>
  );
}
