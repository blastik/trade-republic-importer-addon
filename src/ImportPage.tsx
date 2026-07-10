import React, { useCallback, useEffect, useRef, useState } from "react";
import type {
  Account,
  ActivityCreate,
  ActivityImport,
  ActivityUpdate,
  AddonContext,
  ImportActivitiesResult,
} from "@wealthfolio/addon-sdk";
import {
  Button,
  Card,
  CardContent,
  Icons,
  Progress,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@wealthfolio/ui";
import Papa from "papaparse";
import { loadSettings, saveSettings } from "./settings";
import { SecurityMappingStep } from "./SecurityMappingStep";
import type { SecurityInfo, SecurityMapping } from "./SecurityMappingStep";
import { transform } from "./transform";
import type { ActivityImportEx, AddonSettings, SkippedRow, TransformResult, TrRow } from "./types";

// ─── helpers ────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  return String(iso).replace("T", " ").slice(0, 16);
}

function truncate(s: string | null | undefined, n = 60): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "…" : s;
}

function activityStatus(a: ActivityImport): "valid" | "duplicate" | "error" {
  // Only flag as duplicate if it already exists in the DB (duplicateOfId).
  // duplicateOfLineNumber means checkImport found a similar row elsewhere in the same
  // batch — for our transform this is always a false positive (e.g. TRANSFER_OUT +
  // TRANSFER_IN generated from one CSV row have the same amount and near-identical
  // timestamps). We still pass forceImport:true for those during import.
  if (a.duplicateOfId) return "duplicate";
  if (!a.isValid || (a.errors && Object.keys(a.errors).length > 0)) return "error";
  return "valid";
}

function firstError(a: ActivityImport): string {
  if (!a.errors) return "";
  const msgs = Object.values(a.errors).flat();
  return msgs[0] ?? "";
}

function displayAmount(a: ActivityImport): string {
  const ccy = a.currency ?? "EUR";
  if (a.amount != null && a.amount !== "") return `${Number(a.amount).toFixed(2)} ${ccy}`;
  if (a.quantity != null && a.unitPrice != null) {
    return `${(parseFloat(String(a.quantity)) * parseFloat(String(a.unitPrice))).toFixed(2)} ${ccy}`;
  }
  return "—";
}

// Applies resolved ISIN -> ticker mappings to the transform() output, turning
// the placeholder ISIN symbol into the real (or custom) asset fields.
function applySecurityMappings(
  activities: ActivityImportEx[],
  resolvedMappings: Map<string, SecurityMapping>,
): ActivityImportEx[] {
  return activities.map((a) => {
    if (!a.symbol || a.symbol === "$CASH-EUR") return a;
    const m = resolvedMappings.get(a.symbol);
    if (!m || m === "custom") return a;
    return {
      ...a,
      symbol: m.canonicalSymbol || m.symbol,
      symbolName: m.shortName,
      exchangeMic: m.canonicalExchangeMic || m.exchangeMic,
      quoteCcy: m.currency || a.quoteCcy,
      instrumentType:
        m.quoteType === "EQUITY" ? "EQUITY" : m.quoteType === "ETF" ? "FUND" : a.instrumentType,
      providerId: m.providerId,
      providerSymbol: m.providerSymbol,
      assetId: m.existingAssetId,
    };
  });
}

// ─── UploadZone ─────────────────────────────────────────────────────────────

function UploadZone({ onFile, error }: { onFile: (f: File) => void; error: string }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) onFile(file);
    },
    [onFile],
  );
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`cursor-pointer rounded-lg border-2 border-dashed p-10 text-center transition-colors ${
        dragging
          ? "border-primary bg-primary/5"
          : "border-muted-foreground/30 hover:border-primary/50"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
      <Icons.Upload className="text-muted-foreground mx-auto mb-3 h-8 w-8" />
      <p className="text-sm font-medium">Drop your Trade Republic CSV here</p>
      <p className="text-muted-foreground mt-1 text-xs">or click to browse</p>
      {error && <p className="text-destructive mt-3 text-xs">{error}</p>}
    </div>
  );
}

// ─── SkippedTable ────────────────────────────────────────────────────────────

function SkippedTable({ rows }: { rows: SkippedRow[] }) {
  if (rows.length === 0)
    return <p className="text-muted-foreground p-3 text-xs">No rows were skipped.</p>;
  return (
    <div className="max-h-96 overflow-auto">
      <table className="w-full text-xs">
        <thead className="bg-background sticky top-0 border-b">
          <tr>
            {["Date", "Type", "Description", "Reason"].map((h) => (
              <th key={h} className="text-muted-foreground px-2 py-1.5 text-left font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-border/50 border-b">
              <td className="whitespace-nowrap px-2 py-1 font-mono">{fmtDate(r.datetime)}</td>
              <td className="whitespace-nowrap px-2 py-1 font-mono">{r.type}</td>
              <td className="text-muted-foreground px-2 py-1">{truncate(r.description, 80)}</td>
              <td className="text-muted-foreground px-2 py-1">{r.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── ActivityRow ─────────────────────────────────────────────────────────────

function ActivityRow({
  activity,
  accountName,
  included,
  onToggleInclude,
}: {
  activity: ActivityImport;
  accountName: (id: string) => string;
  included: boolean;
  onToggleInclude: () => void;
}) {
  const status = activityStatus(activity);
  return (
    <tr className="border-border/50 hover:bg-muted/30 border-b">
      <td className="whitespace-nowrap px-2 py-1.5 font-mono text-xs">
        {fmtDate(String(activity.date))}
      </td>
      <td className="whitespace-nowrap px-2 py-1.5 text-xs">{accountName(activity.accountId)}</td>
      <td className="whitespace-nowrap px-2 py-1.5">
        <span className="bg-muted rounded px-1 py-0.5 font-mono text-[10px]">
          {activity.activityType}
        </span>
      </td>
      <td className="whitespace-nowrap px-2 py-1.5 font-mono text-xs">{activity.symbol ?? "—"}</td>
      <td className="whitespace-nowrap px-2 py-1.5 text-right text-xs">
        {displayAmount(activity)}
      </td>
      <td className="px-2 py-1.5 text-xs">
        {status === "valid" && <span className="text-muted-foreground text-[10px]">Ready</span>}
        {status === "duplicate" && (
          <div className="flex items-center gap-1.5">
            <span className="rounded bg-yellow-100 px-1.5 py-0.5 text-[10px] font-medium text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
              Duplicate
            </span>
            <button
              onClick={onToggleInclude}
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                included
                  ? "text-muted-foreground hover:text-foreground"
                  : "bg-primary text-primary-foreground hover:bg-primary/90"
              }`}
            >
              {included ? "Skip" : "Include"}
            </button>
          </div>
        )}
        {status === "error" && (
          <span className="text-destructive text-[10px]" title={firstError(activity)}>
            {truncate(firstError(activity), 50)}
          </span>
        )}
      </td>
    </tr>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

type Step = "upload" | "asset-review" | "checking" | "confirm" | "importing" | "done";

export function ImportPage({ ctx }: { ctx: AddonContext }) {
  const [step, setStep] = useState<Step>("upload");
  const [settings, setSettings] = useState<AddonSettings | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);

  const [parseResult, setParseResult] = useState<TransformResult | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [securities, setSecurities] = useState<SecurityInfo[]>([]);
  const [mappings, setMappings] = useState<Map<string, SecurityMapping>>(new Map());
  const [checked, setChecked] = useState<ActivityImport[] | null>(null);
  const [excludedLines, setExcludedLines] = useState<Set<number>>(new Set());
  const [showDuplicatesOnly, setShowDuplicatesOnly] = useState(false);

  const [fileError, setFileError] = useState("");
  const [checkError, setCheckError] = useState("");
  const [importProgress, setImportProgress] = useState(0);
  const [importResult, setImportResult] = useState<ImportActivitiesResult | null>(null);

  useEffect(() => {
    Promise.all([loadSettings(ctx), ctx.api.accounts.getAll()]).then(([s, accs]) => {
      setSettings(s);
      setAccounts(accs.filter((a) => a.isActive && !a.isArchived));
    });
  }, []);

  const accountName = useCallback(
    (id: string): string => {
      if (!settings) return id;
      if (id === settings.cashAccountId) return "Cash";
      if (id === settings.portfolioAccountId) return "Portfolio";
      return accounts.find((a) => a.id === id)?.name ?? id;
    },
    [settings, accounts],
  );

  // ── Apply symbol mappings and run checkImport ─────────────────────────────

  const runCheckImport = useCallback(
    async (activities: ActivityImport[]) => {
      setStep("checking");
      try {
        const validated = await ctx.api.activities.checkImport(activities);
        setChecked(validated);
        setStep("confirm");
      } catch (e) {
        setCheckError(String(e));
        setChecked(activities);
        setStep("confirm");
      }
    },
    [ctx],
  );

  const handleMappingsComplete = useCallback(
    (resolvedMappings: Map<string, SecurityMapping>) => {
      if (!parseResult) return;
      void runCheckImport(applySecurityMappings(parseResult.activities, resolvedMappings));

      if (settings) {
        const merged = { ...settings.securityMappings };
        for (const [isin, m] of resolvedMappings) merged[isin] = m;
        const next = { ...settings, securityMappings: merged };
        setSettings(next);
        void saveSettings(ctx, next);
      }
    },
    [parseResult, runCheckImport, settings, ctx],
  );

  // ── Upload & transform ────────────────────────────────────────────────────

  const handleFile = useCallback(
    async (file: File) => {
      if (!settings) return;
      setFileError("");
      let text: string;
      try {
        text = await file.text();
      } catch {
        setFileError("Could not read the file.");
        return;
      }

      const parsed = Papa.parse<TrRow>(text, { header: true, skipEmptyLines: true });
      if (parsed.data.length === 0) {
        setFileError("No rows found. Make sure you exported from Trade Republic.");
        return;
      }

      const result = transform(parsed.data, settings);
      setParseResult(result);
      setFileName(file.name);
      setChecked(null);
      setExcludedLines(new Set());
      setShowDuplicatesOnly(false);
      setCheckError("");

      // Collect unique securities (non-cash symbols)
      const secMap = new Map<string, SecurityInfo>();
      for (const a of result.activities) {
        if (!a.symbol || a.symbol === "$CASH-EUR") continue;
        const existing = secMap.get(a.symbol);
        if (existing) {
          existing.count += 1;
        } else {
          secMap.set(a.symbol, { isin: a.symbol, name: a.symbolName ?? "", count: 1 });
        }
      }
      const secs = Array.from(secMap.values());
      setSecurities(secs);

      // Pre-fill mappings already resolved in a previous import, so recurring
      // securities don't need to be mapped again.
      const prefilled = new Map<string, SecurityMapping>();
      for (const s of secs) {
        const known = settings.securityMappings[s.isin];
        if (known) prefilled.set(s.isin, known);
      }
      setMappings(prefilled);

      if (secs.length === 0) {
        await runCheckImport(result.activities);
      } else if (secs.every((s) => prefilled.has(s.isin))) {
        // Every security is already known from a previous import — skip the
        // review step entirely.
        await runCheckImport(applySecurityMappings(result.activities, prefilled));
      } else {
        setStep("asset-review");
      }
    },
    [settings, runCheckImport],
  );

  const toggleExclude = useCallback((lineNumber: number) => {
    setExcludedLines((prev) => {
      const next = new Set(prev);
      if (next.has(lineNumber)) next.delete(lineNumber);
      else next.add(lineNumber);
      return next;
    });
  }, []);

  const toggleAllDuplicates = useCallback(
    (duplicates: ActivityImport[]) => {
      const lines = duplicates
        .filter((a) => a.lineNumber != null)
        .map((a) => a.lineNumber as number);
      const allExcluded = lines.every((ln) => excludedLines.has(ln));
      setExcludedLines(() => {
        if (allExcluded) return new Set<number>();
        return new Set(lines);
      });
    },
    [excludedLines],
  );

  // ── Import ────────────────────────────────────────────────────────────────

  const handleImport = useCallback(async () => {
    if (!checked) return;

    // checkImport round-trips through the backend, which drops our custom
    // transferGroupId (ActivityImport has no such field) — so re-derive the
    // lineNumber -> transferGroupId mapping from the pre-checkImport transform
    // output, since lineNumber does survive checkImport.
    const groupIdByLine = new Map<number, string>();
    for (const a of parseResult?.activities ?? []) {
      if (a.transferGroupId && a.lineNumber != null) groupIdByLine.set(a.lineNumber, a.transferGroupId);
    }

    const dups = checked.filter((a) => activityStatus(a) === "duplicate");
    const userSkippedCount = dups.filter(
      (a) => a.lineNumber != null && excludedLines.has(a.lineNumber),
    ).length;

    const candidates = checked.filter((a) => {
      if (activityStatus(a) === "error") return false;
      // Duplicates are included by default; only skip if user explicitly excluded them.
      if (a.lineNumber != null && excludedLines.has(a.lineNumber)) return false;
      return true;
    });

    setImportProgress(0);
    setStep("importing");

    let importedCount = 0;
    let skippedCount = 0;
    try {
      for (let i = 0; i < candidates.length; i++) {
        const a = candidates[i];
        const sourceGroupId = a.lineNumber != null ? groupIdByLine.get(a.lineNumber) : undefined;
        const assetInput =
          a.symbol || a.assetId
            ? {
                id: a.assetId,
                symbol: a.symbol,
                name: a.symbolName,
                exchangeMic: a.exchangeMic,
                quoteCcy: a.quoteCcy,
                instrumentType: a.instrumentType,
                providerId: a.providerId,
                providerSymbol: a.providerSymbol,
              }
            : undefined;

        try {
          if (activityStatus(a) === "duplicate" && a.duplicateOfId) {
            // Activity already exists — update it so re-imports succeed without duplicating.
            const upd: ActivityUpdate = {
              id: a.duplicateOfId,
              accountId: a.accountId,
              activityType: a.activityType,
              subtype: a.subtype,
              activityDate: a.date as string,
              currency: a.currency,
              quantity: a.quantity,
              unitPrice: a.unitPrice,
              amount: a.amount,
              fee: a.fee,
              fxRate: a.fxRate,
              comment: a.comment,
              asset: assetInput,
              sourceGroupId,
            };
            await ctx.api.activities.update(upd);
          } else {
            const cre: ActivityCreate = {
              accountId: a.accountId,
              activityType: a.activityType,
              subtype: a.subtype,
              activityDate: a.date as string,
              currency: a.currency,
              quantity: a.quantity,
              unitPrice: a.unitPrice,
              amount: a.amount,
              fee: a.fee,
              fxRate: a.fxRate,
              comment: a.comment,
              asset: assetInput,
              sourceGroupId,
            };
            await ctx.api.activities.create(cre);
          }
          importedCount++;
        } catch {
          skippedCount++;
        }
        setImportProgress(Math.round(((i + 1) / candidates.length) * 95) + 2);
      }
      setImportProgress(100);

      const syntheticResult: ImportActivitiesResult = {
        activities: candidates,
        importRunId: "",
        summary: {
          total: candidates.length + userSkippedCount,
          imported: importedCount,
          skipped: skippedCount,
          duplicates: userSkippedCount,
          assetsCreated: 0,
          success: skippedCount === 0,
        },
      };
      setImportResult(syntheticResult);
      setStep("done");

      try {
        await ctx.api.portfolio.update();
        ctx.api.query.invalidateQueries([]);
      } catch {
        // non-critical
      }
    } catch (e) {
      setCheckError(String(e));
      setStep("confirm");
    }
  }, [checked, excludedLines, ctx, parseResult]);

  // ── Reset ─────────────────────────────────────────────────────────────────

  const reset = useCallback(() => {
    setStep("upload");
    setParseResult(null);
    setFileName("");
    setSecurities([]);
    setMappings(new Map());
    setChecked(null);
    setExcludedLines(new Set());
    setShowDuplicatesOnly(false);
    setFileError("");
    setCheckError("");
    setImportResult(null);
    setImportProgress(0);
  }, []);

  // Goes back to upload without wiping parse results — keeps file data intact.
  const goBackToUpload = useCallback(() => {
    setStep("upload");
    setChecked(null);
    setCheckError("");
  }, []);

  // ────────────────────────────────────────────────────────────────────────────

  // Not configured
  if (settings && (!settings.cashAccountId || !settings.portfolioAccountId)) {
    return (
      <div className="max-w-lg p-6">
        <Card>
          <CardContent className="space-y-3 p-6 text-center">
            <Icons.Settings className="text-muted-foreground mx-auto h-8 w-8" />
            <p className="font-medium">Settings not configured</p>
            <p className="text-muted-foreground text-sm">
              Please go to the <strong>Settings</strong> tab and select your Cash and Portfolio
              accounts before importing.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Upload ───────────────────────────────────────────────────────────────

  if (step === "upload") {
    const continueToNextStep = securities.length > 0 ? "asset-review" : undefined;
    return (
      <div className="max-w-xl space-y-4 p-6">
        <div>
          <h1 className="text-2xl font-semibold">Import Trade Republic CSV</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Export from Trade Republic → Settings → Documents → Transaction history, then upload
            below.
          </p>
        </div>
        {parseResult && fileName ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-lg border p-4">
              <Icons.FileText className="text-muted-foreground h-8 w-8 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{fileName}</p>
                <p className="text-muted-foreground text-xs">
                  {parseResult.activities.length} activities parsed
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                className="flex-1"
                onClick={() =>
                  continueToNextStep
                    ? setStep(continueToNextStep)
                    : void runCheckImport(parseResult.activities)
                }
              >
                Continue
              </Button>
              <Button variant="outline" onClick={reset}>
                Upload different file
              </Button>
            </div>
            {fileError && <p className="text-destructive text-xs">{fileError}</p>}
          </div>
        ) : (
          <UploadZone onFile={handleFile} error={fileError} />
        )}
      </div>
    );
  }

  // ── Asset Review ─────────────────────────────────────────────────────────

  if (step === "asset-review") {
    return (
      <SecurityMappingStep
        securities={securities}
        ctx={ctx}
        mappings={mappings}
        onMappingsChange={setMappings}
        onComplete={handleMappingsComplete}
        onBack={goBackToUpload}
      />
    );
  }

  // ── Checking ─────────────────────────────────────────────────────────────

  if (step === "checking") {
    const total = parseResult?.activities.length ?? 0;
    return (
      <div className="max-w-md space-y-4 p-6">
        <h1 className="text-2xl font-semibold">Validating…</h1>
        <Progress value={undefined} className="animate-pulse" />
        <p className="text-muted-foreground text-sm">
          Checking {total} activities for duplicates and errors…
        </p>
      </div>
    );
  }

  // ── Confirm ───────────────────────────────────────────────────────────────

  if (step === "confirm" && checked) {
    const valid = checked.filter((a) => activityStatus(a) === "valid");
    const duplicates = checked.filter((a) => activityStatus(a) === "duplicate");
    const errors = checked.filter((a) => activityStatus(a) === "error");
    const userExcludedCount = duplicates.filter(
      (a) => a.lineNumber != null && excludedLines.has(a.lineNumber),
    ).length;
    const toImportCount = valid.length + duplicates.length - userExcludedCount;
    const unsupported = parseResult?.skipped ?? [];

    const visibleActivities = showDuplicatesOnly
      ? checked.filter((a) => activityStatus(a) === "duplicate")
      : checked;

    return (
      <div className="max-w-5xl space-y-4 p-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Review activities</h1>
            <p className="text-muted-foreground mt-0.5 text-sm">
              {valid.length} ready · {duplicates.length} duplicates · {errors.length} errors
              {unsupported.length > 0 && ` · ${unsupported.length} unsupported`}
            </p>
            {checkError && (
              <p className="text-destructive mt-1 text-xs">
                Validation warning: {checkError} — review manually.
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setStep(securities.length > 0 ? "asset-review" : "upload")}
            >
              Back
            </Button>
            <Button onClick={handleImport} disabled={toImportCount === 0}>
              Import {toImportCount} activities
            </Button>
          </div>
        </div>

        {/* Duplicate banner */}
        {duplicates.length > 0 && (
          <div className="bg-muted flex items-center justify-between rounded-lg px-4 py-3 text-sm">
            <span>
              <span className="font-medium">{duplicates.length} duplicate</span>
              {duplicates.length !== 1 ? "s" : ""} already exist in Wealthfolio — will be{" "}
              <strong>updated</strong> unless skipped.
            </span>
            <button
              onClick={() => toggleAllDuplicates(duplicates)}
              className="bg-primary text-primary-foreground hover:bg-primary/90 ml-4 shrink-0 rounded px-2 py-1 text-xs font-medium transition-colors"
            >
              {duplicates.every((a) => a.lineNumber != null && excludedLines.has(a.lineNumber))
                ? "Include all"
                : "Skip all"}
            </button>
          </div>
        )}

        {/* Activities + Unsupported tabs */}
        <Card>
          <CardContent className="p-0">
            <Tabs defaultValue="activities">
              <div className="flex items-center justify-between px-3 pt-3">
                <TabsList>
                  <TabsTrigger value="activities">Activities ({checked.length})</TabsTrigger>
                  <TabsTrigger value="unsupported">Unsupported ({unsupported.length})</TabsTrigger>
                </TabsList>
                {duplicates.length > 0 && (
                  <button
                    onClick={() => setShowDuplicatesOnly((v) => !v)}
                    className={`rounded px-2 py-1 text-xs font-medium transition-colors ${
                      showDuplicatesOnly
                        ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {showDuplicatesOnly
                      ? `Showing duplicates only (${duplicates.length})`
                      : `Show duplicates only (${duplicates.length})`}
                  </button>
                )}
              </div>

              <TabsContent value="activities" className="mt-0">
                <div className="max-h-[500px] overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-background sticky top-0 border-b">
                      <tr>
                        {["Date", "Account", "Type", "Symbol", "Amount", "Status"].map((h) => (
                          <th
                            key={h}
                            className="text-muted-foreground whitespace-nowrap px-2 py-1.5 text-left font-medium"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {visibleActivities.map((a, i) => (
                        <ActivityRow
                          key={i}
                          activity={a}
                          accountName={accountName}
                          included={a.lineNumber == null || !excludedLines.has(a.lineNumber)}
                          onToggleInclude={() =>
                            a.lineNumber != null && toggleExclude(a.lineNumber)
                          }
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </TabsContent>

              <TabsContent value="unsupported" className="mt-0">
                <SkippedTable rows={unsupported} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Importing ─────────────────────────────────────────────────────────────

  if (step === "importing") {
    return (
      <div className="max-w-md space-y-4 p-6">
        <h1 className="text-2xl font-semibold">Importing…</h1>
        <Progress value={importProgress} />
        <p className="text-muted-foreground text-sm">Saving activities to Wealthfolio…</p>
      </div>
    );
  }

  // ── Done ─────────────────────────────────────────────────────────────────

  if (step === "done" && importResult) {
    const { summary } = importResult;
    const hasIssues = !summary.success || (summary.skipped ?? 0) > 0;

    return (
      <div className="max-w-2xl space-y-4 p-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          {summary.success ? (
            <Icons.CheckCircle className="h-8 w-8 shrink-0 text-green-600" />
          ) : (
            <Icons.AlertCircle className="text-destructive h-8 w-8 shrink-0" />
          )}
          <div>
            <h1 className="text-2xl font-semibold">
              {summary.success ? "Import complete" : "Import finished with issues"}
            </h1>
            <p className="text-muted-foreground text-sm">
              {summary.imported} activities imported successfully.
            </p>
          </div>
        </div>

        {/* Summary tiles */}
        <div className="grid grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold">{summary.total}</p>
              <p className="text-muted-foreground mt-0.5 text-xs">Total</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-green-600">{summary.imported}</p>
              <p className="text-muted-foreground mt-0.5 text-xs">Imported</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-muted-foreground text-2xl font-bold">
                {summary.duplicates ?? 0}
              </p>
              <p className="text-muted-foreground mt-0.5 text-xs">Manually skipped</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p
                className={`text-2xl font-bold ${(summary.skipped ?? 0) > 0 ? "text-muted-foreground" : "text-muted-foreground"}`}
              >
                {summary.skipped ?? 0}
              </p>
              <p className="text-muted-foreground mt-0.5 text-xs">Skipped</p>
            </CardContent>
          </Card>
        </div>

        {hasIssues && (
          <p className="text-muted-foreground text-sm">
            {summary.skipped ?? 0} activit{(summary.skipped ?? 0) === 1 ? "y" : "ies"} could not
            be saved. They may already exist or contain invalid data.
          </p>
        )}

        <Button variant="outline" onClick={reset}>
          Import another file
        </Button>
      </div>
    );
  }

  return null;
}
