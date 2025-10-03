import React, { useMemo, useRef, useState } from "react";
import { Upload, BarChart3, LineChart, Table as TableIcon, TrendingUp } from "lucide-react";
import Papa from "papaparse";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip,
  LineChart as RLineChart, Line, CartesianGrid
} from "recharts";

/* ========= Types ========= */
type Row = { date: Date; product: string; units: number; unit_price: number; sales: number };
type MonthlyRow = { key: string; sales: number; transactions: number; pct_change?: number };

/* ========= Utils ========= */
const fmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

function normalizeHeader(h = "") {
  return String(h).trim().toLowerCase().replace(/\s+/g, "_");
}

function parseCSV(file: File) {
  return new Promise<any[]>((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      transformHeader: normalizeHeader,
      complete: (results: Papa.ParseResult<any>) => resolve(results.data as any[]),
      error: (err: unknown) => reject(err),
    });
  });
}

function toDate(d: unknown) {
  const dt = new Date(d as any);
  return isNaN(dt.getTime()) ? null : dt;
}

function monthKey(dt: Date) {
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
}

function aggregate(data: any[]) {
  // --- rows: clean + typed ---
  const rowsUnsorted = data
    .map((r): Row | null => {
      // header'lar zaten normalizeHeader ile lower_snake_case oluyor
      const dateRaw = (r as any).date ?? (r as any).order_date ?? (r as any).tarih;
      const date = toDate(dateRaw);
      const product =
        (r as any).product ?? (r as any).ürün ?? (r as any).Product ?? "Unknown";

      // quantity / units alias'ları
      const unitsVal =
        (r as any).units ??
        (r as any).quantity ??
        (r as any).adet ??
        (r as any).Units ??
        (r as any).Quantity;
      const units = Number(unitsVal);

      // unit_price / price alias'ları
      const unitPriceVal =
        (r as any).unit_price ??
        (r as any).price ??
        (r as any).Unit_Price ??
        (r as any).Price;
      const unit_price = Number(unitPriceVal);

      // sales / revenue alias'ları
      const rawSales =
        (r as any).sales ??
        (r as any).revenue ??
        (r as any).ciro ??
        (r as any).Sales ??
        (r as any).Revenue;

      const numericSales =
        rawSales == null || rawSales === "" || isNaN(Number(rawSales))
          ? units * unit_price
          : Number(rawSales);

      if (!date || Number.isNaN(units) || Number.isNaN(unit_price) || Number.isNaN(numericSales))
        return null;

      return { date, product, units, unit_price, sales: numericSales };
    })
    .filter((x): x is Row => x !== null);

  const rows = rowsUnsorted.sort((a, b) => a.date.getTime() - b.date.getTime());

  // --- product totals ---
  const productTotals = new Map<string, number>();
  for (const r of rows) productTotals.set(r.product, (productTotals.get(r.product) || 0) + r.sales);

  const productTotalsArr = Array.from(productTotals, ([product, total_sales]) => ({ product, total_sales }))
    .sort((a, b) => b.total_sales - a.total_sales);

  const totalAll = productTotalsArr.reduce((s, x) => s + x.total_sales, 0);
  (productTotalsArr as Array<{ product: string; total_sales: number } & { percent?: number }>).forEach(
    (x) => (x.percent = totalAll ? (x.total_sales / totalAll) * 100 : 0)
  );

  // --- monthly rollup ---
  const monthlyMap = new Map<string, MonthlyRow>();
  for (const r of rows) {
    const key = monthKey(r.date);
    const cur = monthlyMap.get(key) || { key, sales: 0, transactions: 0 };
    cur.sales += r.sales;
    cur.transactions += 1;
    monthlyMap.set(key, cur);
  }
  const monthly: MonthlyRow[] = Array.from(monthlyMap.values()).sort((a, b) => a.key.localeCompare(b.key));

  // pct change
  for (let i = 1; i < monthly.length; i++) {
    const prev = monthly[i - 1].sales || 0;
    monthly[i].pct_change = prev ? ((monthly[i].sales - prev) / prev) * 100 : 0;
  }

  // --- quick baselines ---
  const y = monthly.map((m) => m.sales);
  const naive = y.length ? y[y.length - 1] : 0;
  const k = Math.min(3, y.length || 0);
  const ma = k ? y.slice(-k).reduce((s, v) => s + v, 0) / k : 0;

  return { rows, productTotalsArr, monthly, naive, ma };
}


/* ========= UI bits ========= */
function Stat({ icon: Icon, label, value }: { icon: any; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 border border-neutral-800 rounded-2xl p-4 bg-neutral-900/40">
      <div className="w-10 h-10 rounded-xl bg-neutral-800 flex items-center justify-center">
        <Icon size={18} />
      </div>
      <div>
        <div className="text-xs text-neutral-400">{label}</div>
        <div className="font-semibold text-lg">{value}</div>
      </div>
    </div>
  );
}

/* ========= App ========= */
export default function App() {
  const [parsed, setParsed] = useState<any[] | null>(null);
  const [error, setError] = useState<string>("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  const stats = useMemo(() => (parsed ? aggregate(parsed) : null), [parsed]);
  const hasData = Boolean(stats?.rows?.length);

  const handleFile = async (file: File) => {
    try {
      setError("");
      const data = await parseCSV(file);
      if (!data?.length) throw new Error("CSV boş veya okunamadı.");
      setParsed(data);
    } catch (e: any) {
      setError(e?.message || "Dosya okunamadı");
    }
  };

  const lastMonthly: MonthlyRow | null =
    stats?.monthly && stats.monthly.length ? stats.monthly[stats.monthly.length - 1] : null;

  return (
    <div className="min-h-screen px-6 md:px-10 py-8 bg-gradient-to-b from-neutral-950 via-neutral-950 to-neutral-900 text-white">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">SalesPulse – CSV Dashboard</h1>
            <p className="text-sm text-neutral-400">CSV yükle → Top ürünler, aylık trend, hızlı tahmin.</p>
          </div>
          <div>
            <button
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2 border border-neutral-700 bg-neutral-900 hover:bg-neutral-800 transition"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="w-4 h-4" /> CSV Yükle
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => e.currentTarget.files?.[0] && handleFile(e.currentTarget.files[0])}
            />
          </div>
        </header>

        {!hasData && !error && (
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
            className="border-2 border-dashed border-neutral-700 rounded-2xl p-8 text-center bg-neutral-900/40"
          >
            <Upload className="w-8 h-8 mx-auto mb-3" />
            <div className="font-medium">CSV dosyanızı buraya sürükleyin</div>
            <div className="text-sm text-neutral-400">veya yukarıdan seçin.</div>
          </div>
        )}

        {error && (
          <div className="border border-red-800 bg-red-950/40 rounded-2xl p-3">
            <strong>Hata:</strong> {error}
          </div>
        )}

        {hasData && stats && (
          <div className="space-y-6">
            {/* Stats */}
            <section className="grid md:grid-cols-3 gap-4">
              <Stat
                icon={BarChart3}
                label="Toplam Satış"
                value={`$${fmt.format(stats.productTotalsArr.reduce((s: number, x: any) => s + x.total_sales, 0))}`}
              />
              <Stat icon={TableIcon} label="Ürün Sayısı" value={stats.productTotalsArr.length} />
              <Stat icon={TrendingUp} label="Kayıt Sayısı" value={stats.rows.length} />
            </section>

            {/* Charts */}
            <section className="grid lg:grid-cols-2 gap-6">
              <div className="border border-neutral-800 rounded-2xl bg-[rgb(18,18,18)] p-4">
                <div className="flex items-center gap-2 mb-2">
                  <BarChart3 className="w-5 h-5" />
                  <h3 className="font-semibold">Top Ürünler</h3>
                </div>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats.productTotalsArr} margin={{ top: 10, right: 20, left: 0, bottom: 40 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="product" angle={-20} textAnchor="end" interval={0} height={60} />
                      <YAxis tickFormatter={(v) => `$${fmt.format(v)}`} />
                      <Tooltip formatter={(v: any, n: string) => (n === "total_sales" ? `$${fmt.format(v)}` : `${fmt.format(v)}%`)} />
                      <Bar dataKey="total_sales" name="Total Sales" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="border border-neutral-800 rounded-2xl bg-[rgb(18,18,18)] p-4">
                <div className="flex items-center gap-2 mb-2">
                  <LineChart className="w-5 h-5" />
                  <h3 className="font-semibold">Aylık Trend</h3>
                </div>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <RLineChart data={stats.monthly} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="key" />
                      <YAxis tickFormatter={(v) => `$${fmt.format(v)}`} />
                      <Tooltip formatter={(v: any) => `$${fmt.format(v)}`} />
                      <Line type="monotone" dataKey="sales" name="Monthly Sales" dot />
                    </RLineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </section>

            {/* Baselines */}
            <section className="grid md:grid-cols-3 gap-4">
              <Stat icon={TrendingUp} label="Naive (son ay)" value={`$${fmt.format(stats.naive)}`} />
              <Stat icon={TrendingUp} label="MA(3) ortalaması" value={`$${fmt.format(stats.ma)}`} />
              <Stat
                icon={TrendingUp}
                label="Aylık % değişim (son)"
                value={`${fmt.format(lastMonthly?.pct_change ?? 0)}%`}
              />
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
