import React, { useEffect, useState } from "react";
import type { Account, AddonContext } from "@wealthfolio/addon-sdk";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Icons,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
} from "@wealthfolio/ui";
import { loadSettings, saveSettings } from "./settings";
import type { AddonSettings, TransferPattern } from "./types";

function AccountSelect({
  accounts,
  value,
  onChange,
  placeholder,
}: {
  accounts: Account[];
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {accounts.map((a) => (
          <SelectItem key={a.id} value={a.id}>
            {a.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function PatternRow({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-2">
      {children}
      <Button type="button" variant="ghost" size="icon" onClick={onRemove} className="shrink-0">
        <Icons.Trash className="text-muted-foreground h-4 w-4" />
      </Button>
    </div>
  );
}

export function SettingsPage({ ctx }: { ctx: AddonContext }) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [settings, setSettings] = useState<AddonSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([ctx.api.accounts.getAll(), loadSettings(ctx)]).then(([accs, s]) => {
      setAccounts(accs.filter((a) => a.isActive && !a.isArchived));
      setSettings(s);
    });
  }, []);

  if (!settings) {
    return <div className="text-muted-foreground p-6 text-sm">Loading settings…</div>;
  }

  const set = (patch: Partial<AddonSettings>) => {
    setSaved(false);
    setSettings((s) => ({ ...s!, ...patch }));
  };

  const updatePattern = (i: number, patch: Partial<TransferPattern>) =>
    set({
      transferPatterns: settings.transferPatterns.map((p, idx) =>
        idx === i ? { ...p, ...patch } : p,
      ),
    });

  const removePattern = (i: number) =>
    set({ transferPatterns: settings.transferPatterns.filter((_, idx) => idx !== i) });

  const addPattern = () => set({ transferPatterns: [...settings.transferPatterns, { label: "" }] });

  const handleSave = async () => {
    if (!settings.cashAccountId || !settings.portfolioAccountId) {
      setError("Please select both the Cash and Portfolio accounts.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      await saveSettings(ctx, settings);
      setSaved(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const noDestOption = "—";

  return (
    <div className="max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Trade Republic Importer — Settings</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Configure once; settings are saved securely and pre-filled on every import.
        </p>
      </div>

      {/* Accounts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Accounts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-xs">
            Trade Republic does not separate cash from securities — everything lives in one account.
            Wealthfolio tracks them separately so you can monitor spending, interest, and investment
            performance independently. Select the two Wealthfolio accounts that represent your TR
            balance below.
          </p>
          <div className="space-y-1">
            <Label>Trade Republic cash account</Label>
            <AccountSelect
              accounts={accounts}
              value={settings.cashAccountId}
              onChange={(v) => set({ cashAccountId: v })}
              placeholder="Select cash account…"
            />
            <p className="text-muted-foreground text-xs">
              Receives deposits, withdrawals, card transactions, interest, and saveback rewards.
            </p>
          </div>
          <div className="space-y-1">
            <Label>Trade Republic securities account</Label>
            <AccountSelect
              accounts={accounts}
              value={settings.portfolioAccountId}
              onChange={(v) => set({ portfolioAccountId: v })}
              placeholder="Select securities account…"
            />
            <p className="text-muted-foreground text-xs">
              Receives buy/sell trades and dividends. The importer automatically creates internal
              transfers between the two accounts to keep balances correct.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Transfer patterns */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Transfer patterns</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-muted-foreground text-xs">
            Outbound transfers matching a pattern are recorded as <code>TRANSFER_OUT</code> instead
            of <code>WITHDRAWAL</code>. Each pattern requires at least one of:
          </p>
          <ul className="text-muted-foreground list-inside list-disc text-xs">
            <li>
              <strong>IBAN</strong> — matched against the counterparty IBAN field, or as a substring
              of the description (Trade Republic sometimes embeds the IBAN there instead).
            </li>
            <li>
              <strong>Keyword</strong> — matched as a case-insensitive substring of the description.
            </li>
          </ul>
          <p className="text-muted-foreground text-xs">
            IBAN is tried first (more precise). You can set both on the same pattern.
          </p>
          {settings.transferPatterns.length === 0 && (
            <p className="text-muted-foreground text-xs italic">No transfer patterns configured.</p>
          )}
          {settings.transferPatterns.map((p, i) => (
            <PatternRow key={i} onRemove={() => removePattern(i)}>
              <Input
                placeholder="IBAN (e.g. ES36…)"
                value={p.iban ?? ""}
                onChange={(e) => updatePattern(i, { iban: e.target.value.trim() || undefined })}
                className="font-mono text-xs"
              />
              <Input
                placeholder="Keyword (e.g. INDEXA)"
                value={p.keyword ?? ""}
                onChange={(e) => updatePattern(i, { keyword: e.target.value || undefined })}
              />
              <Input
                placeholder="Label (e.g. Indexa pensiones)"
                value={p.label}
                onChange={(e) => updatePattern(i, { label: e.target.value })}
              />
              <Select
                value={p.destinationAccountId ?? noDestOption}
                onValueChange={(v) =>
                  updatePattern(i, { destinationAccountId: v === noDestOption ? undefined : v })
                }
              >
                <SelectTrigger className="w-44 shrink-0">
                  <SelectValue placeholder="Destination…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={noDestOption}>No destination</SelectItem>
                  <Separator />
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </PatternRow>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={addPattern}>
            <Icons.Plus className="mr-1 h-4 w-4" />
            Add pattern
          </Button>
        </CardContent>
      </Card>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save settings"}
        </Button>
        {saved && (
          <span className="text-muted-foreground flex items-center gap-1 text-sm">
            <Icons.Check className="h-4 w-4 text-green-600" />
            Saved
          </span>
        )}
      </div>
    </div>
  );
}
