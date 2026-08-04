import React, { useState, useEffect, useCallback } from 'react';
import { FileSpreadsheet, Download, AlertTriangle, Info } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { get } from '../api/client';

// Working figures a pharmacy prepares from its own records: what it owes, what
// it holds, what it sold, and what it dispensed against prescription.
//
// Nothing here is a filing. The system is not a ZRA-approved invoicing
// provider, so it summarises what it recorded and leaves the return to whoever
// is authorised to file one. That distinction is printed on the VAT view and
// carried into the export, because a figure that leaves this screen as a CSV
// has to keep its caveat with it.

const TABS = [
  { id: 'vat', label: 'VAT summary' },
  { id: 'trading', label: 'Trading' },
  { id: 'stock', label: 'Stock valuation' },
  { id: 'dispensing', label: 'Dispensing register' }
];

const todayISO = () => new Date().toISOString().slice(0, 10);
const monthStartISO = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};

export default function Reports() {
  const { currency, pharmacyName } = useAuth();
  const [tab, setTab] = useState('vat');
  const [from, setFrom] = useState(monthStartISO());
  const [to, setTo] = useState(todayISO());
  // The payload carries the tab it was fetched for. Selecting a new tab
  // re-renders before the fetch resolves, so holding the data on its own let a
  // report render against the previous report's shape for one frame — enough
  // for the dispensing view to read `entries` off a VAT payload and throw.
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const data = payload && payload.tab === tab ? payload.data : null;
  const notice = payload && payload.tab === tab ? payload.notice : null;

  const money = (n) => (n === null || n === undefined ? '—' : `${currency} ${Number(n).toFixed(2)}`);

  const load = useCallback(async () => {
    setLoading(true);
    // Stock valuation is a position, not a period, so it takes no range.
    const query = tab === 'stock' ? '' : `?from=${from}&to=${to}`;
    const res = await get(`reports/${tab}${query}`);

    if (res?.data) {
      setPayload({ tab, data: res.data, notice: res.notice || null });
      setError(null);
    } else {
      setPayload(null);
      setError(res?.error || 'That report could not be prepared.');
    }
    setLoading(false);
  }, [tab, from, to]);

  useEffect(() => { load(); }, [load]);

  // Exports what is on screen. The caveat travels with it: a CSV opened in a
  // spreadsheet three weeks later has no other way to say what it is not.
  const exportCsv = () => {
    if (!data) return;
    const rows = [];
    rows.push([`${pharmacyName} — ${TABS.find((t) => t.id === tab).label}`]);
    if (data.period) rows.push([`Period`, data.period.from, 'to', data.period.to]);
    if (data.as_at) rows.push([`As at`, data.as_at]);
    rows.push([]);

    const flat = (obj, prefix = '') => {
      for (const [k, v] of Object.entries(obj)) {
        if (v === null || v === undefined) continue;
        if (Array.isArray(v)) {
          if (v.length === 0) continue;
          rows.push([]);
          rows.push([prefix + k]);
          rows.push(Object.keys(v[0]));
          v.forEach((r) => rows.push(Object.values(r)));
        } else if (typeof v === 'object') {
          flat(v, `${prefix}${k}.`);
        } else {
          rows.push([prefix + k, v]);
        }
      }
    };
    flat(data);

    if (notice) {
      rows.push([]);
      rows.push([notice]);
    }

    const csv = rows
      .map((r) => r.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${tab}-${data.period ? `${data.period.from}_${data.period.to}` : data.as_at}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast.success('Exported');
  };

  return (
    <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: '700', color: 'var(--text)' }}>Reports</h1>
          <p style={{ color: 'var(--text-2)', fontSize: '0.9rem', marginTop: '4px' }}>
            Working figures prepared from this pharmacy&apos;s own records
          </p>
        </div>
        <button className="btn btn-secondary" onClick={exportCsv} disabled={!data}>
          <Download size={16} /> Export CSV
        </button>
      </div>

      <div style={{ background: 'var(--surface)', padding: '12px 16px', borderRadius: '12px', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`btn ${tab === t.id ? 'btn-success' : 'btn-secondary'}`}
            onClick={() => setTab(t.id)}
            style={{ fontSize: '0.85rem', padding: '6px 14px' }}
          >
            {t.label}
          </button>
        ))}

        {tab !== 'stock' && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginLeft: 'auto' }}>
            <input type="date" className="input-field" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 'auto' }} />
            <span style={{ color: 'var(--text-2)', fontSize: '0.85rem' }}>to</span>
            <input type="date" className="input-field" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 'auto' }} />
          </div>
        )}
      </div>

      {error && (
        <div style={{ background: 'var(--surface)', border: '1px solid #b91c1c', borderRadius: '12px', padding: '16px', color: '#fca5a5' }}>
          {error}
        </div>
      )}

      {notice && (
        <div style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.35)', borderRadius: '12px', padding: '12px 16px', color: '#93c5fd', fontSize: '0.85rem', display: 'flex', gap: '10px' }}>
          <Info size={18} style={{ flexShrink: 0, marginTop: '1px' }} />
          <span>{notice}</span>
        </div>
      )}

      {loading || !data ? (
        <Panel>
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-2)' }}>
            {error ? 'Nothing can be shown.' : 'Preparing…'}
          </div>
        </Panel>
      ) : tab === 'vat' ? (
        <VatReport data={data} money={money} />
      ) : tab === 'trading' ? (
        <TradingReport data={data} money={money} />
      ) : tab === 'stock' ? (
        <StockReport data={data} money={money} />
      ) : (
        <DispensingReport data={data} />
      )}
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <div style={{ background: 'var(--surface)', borderRadius: '14px', border: '1px solid var(--border)', overflow: 'hidden' }}>
      {title && (
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text)' }}>{title}</h2>
        </div>
      )}
      {children}
    </div>
  );
}

function Figure({ label, value, accent, hint }) {
  return (
    <div>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-2)', marginBottom: '2px' }}>{label}</div>
      <div style={{ fontSize: '1.3rem', fontWeight: 700, color: accent || 'var(--text)' }}>{value}</div>
      {hint && <div style={{ fontSize: '0.72rem', color: 'var(--text-2)', marginTop: '2px' }}>{hint}</div>}
    </div>
  );
}

const Grid = ({ children }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '18px', padding: '20px' }}>
    {children}
  </div>
);

function VatReport({ data, money }) {
  const off = Math.abs(Number(data.variance)) >= 0.01;
  return (
    <>
      <Panel title={`VAT summary · ${data.period.from} to ${data.period.to}`}>
        <Grid>
          <Figure label="Standard-rated net" value={money(data.standard_rated_net)} />
          <Figure
            label="Zero-rated net"
            value={money(data.zero_rated_net)}
            hint="Medicines, Group 6 of the VAT (Zero-Rating) Order"
          />
          <Figure label="Exempt net" value={money(data.exempt_net)} />
          <Figure
            label={`Output tax at ${(data.vat_rate * 100).toFixed(0)}%`}
            value={money(data.output_tax_calculated)}
            accent="#4ade80"
            hint="Charged on standard-rated lines only"
          />
          <Figure label="Gross takings" value={money(data.gross_takings)} />
          <Figure label="Sales" value={data.sale_count} />
        </Grid>
      </Panel>

      <Panel title="Reconciliation">
        <Grid>
          <Figure label="Tax calculated here" value={money(data.output_tax_calculated)} />
          <Figure label="Tax recorded on sales" value={money(data.output_tax_recorded)} />
          <Figure
            label="Variance"
            value={money(data.variance)}
            accent={off ? '#f87171' : '#4ade80'}
            hint={off ? 'Investigate before anything is filed' : 'The sales agree with the rate in force'}
          />
        </Grid>
      </Panel>
    </>
  );
}

function TradingReport({ data, money }) {
  const t = data.till;
  return (
    <>
      <Panel title={`Trading · ${data.period.from} to ${data.period.to}`}>
        <Grid>
          <Figure label="Sales" value={data.totals.sale_count} />
          <Figure label="Net" value={money(data.totals.net)} />
          <Figure label="VAT" value={money(data.totals.tax)} />
          <Figure label="Gross" value={money(data.totals.gross)} accent="#4ade80" />
          <Figure
            label="Till variance"
            value={money(t.net_variance)}
            accent={Number(t.net_variance) < 0 ? '#f87171' : '#4ade80'}
            hint={`${t.closed_sessions} shift${t.closed_sessions === 1 ? '' : 's'} counted · short ${money(t.total_short)}`}
          />
        </Grid>
      </Panel>

      <Panel title="By day">
        <Table
          head={['Day', 'Sales', 'Net', 'VAT', 'Gross', 'Scheme covered', 'Patient paid']}
          rows={data.daily.map((d) => [
            new Date(d.day).toLocaleDateString(), d.sale_count,
            money(d.net), money(d.tax), money(d.gross), money(d.scheme_covered), money(d.patient_paid)
          ])}
        />
      </Panel>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
        <Panel title="By payment method">
          <Table
            head={['Method', 'Count', 'Amount']}
            rows={data.by_payment_method.map((m) => [m.payment_type, m.count, money(m.amount)])}
          />
        </Panel>
        <Panel title="By who served">
          <Table
            head={['Served by', 'Sales', 'Gross']}
            rows={data.by_staff.map((s) => [s.served_by || '—', s.sale_count, money(s.gross)])}
          />
        </Panel>
      </div>

      <Panel title="Best selling">
        <Table
          head={['Product', 'Units', 'Net']}
          rows={data.top_products.map((p) => [p.product, p.units, money(p.net)])}
        />
      </Panel>
    </>
  );
}

function StockReport({ data, money }) {
  return (
    <>
      <Panel title={`Stock held as at ${data.as_at}`}>
        <Grid>
          <Figure label="Product lines" value={data.holding.product_lines} />
          <Figure label="Units" value={data.holding.units} />
          <Figure label="At cost" value={money(data.holding.at_cost)} />
          <Figure label="At retail" value={money(data.holding.at_retail)} accent="#4ade80" />
          <Figure
            label="Already expired"
            value={money(data.expired.at_cost)}
            accent={data.expired.units > 0 ? '#f87171' : undefined}
            hint={`${data.expired.units} units — a loss already taken`}
          />
        </Grid>
      </Panel>

      <Panel title={`Expiring within ${data.expiry_alert_days} days`}>
        <Table
          head={['Product', 'Batch', 'Expires', 'Units', 'At cost']}
          rows={data.expiring_soon.map((b) => [
            b.product, b.batch_number, new Date(b.expiry_date).toLocaleDateString(),
            b.quantity_on_hand, money(b.at_cost)
          ])}
          empty="Nothing is expiring in this window."
        />
      </Panel>

      <Panel title="At or below reorder level">
        <Table
          head={['Product', 'On hand', 'Reorder level']}
          rows={data.below_reorder_level.map((p) => [p.product, p.on_hand, p.reorder_level])}
          empty="Everything is above its reorder level."
        />
      </Panel>
    </>
  );
}

function DispensingReport({ data }) {
  return (
    <Panel title={`Prescription-only dispensing · ${data.period.from} to ${data.period.to} · ${data.entry_count} entries`}>
      <Table
        head={['When', 'Receipt', 'Medicine', 'Qty', 'Batch', 'Patient', 'Prescriber', 'Verified by', 'Dispensed by']}
        rows={data.entries.map((e) => [
          new Date(e.date_time).toLocaleString(),
          e.receipt_number,
          `${e.product}${e.dosage ? ` ${e.dosage}` : ''}`,
          e.quantity,
          e.batch_number || '—',
          `${e.patient_name || '—'}${e.patient_nrc ? ` (${e.patient_nrc})` : ''}`,
          e.prescriber || '—',
          e.verified_by || '—',
          e.dispensed_by || '—'
        ])}
        empty="No prescription-only medicines were dispensed in this period."
      />
    </Panel>
  );
}

function Table({ head, rows, empty }) {
  return (
    <>
      <div style={{ overflowX: 'auto' }}>
        <table className="cart-table">
          <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && (
        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-2)' }}>
          {empty || 'Nothing to report for this period.'}
        </div>
      )}
    </>
  );
}
