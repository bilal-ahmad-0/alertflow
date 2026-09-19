import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { BarChart3 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

function formatSeconds(s) {
  if (s == null) return '—';
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

const SEVERITY_COLORS = { critical: '#ef4444', warning: '#f59e0b', info: '#3b82f6' };
const CHART_COLORS = ['#6366f1', '#ec4899', '#10b981', '#f59e0b', '#3b82f6', '#8b5cf6', '#06b6d4'];

export default function Analytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getAnalytics().then(setData).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading-spinner"><div className="spinner" /></div>;
  if (!data) return null;

  return (
    <div>
      <div className="page-header">
        <h1>Analytics</h1>
        <p>Operational metrics, incident analytics, and delivery performance.</p>
      </div>

      {/* KPI Row */}
      <div className="kpi-grid" style={{ marginBottom: 24 }}>
        <div className="kpi-card">
          <div className="kpi-label">Total Alerts</div>
          <div className="kpi-value">{data.totalAlerts}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Critical Alerts</div>
          <div className="kpi-value critical">{data.criticalAlerts}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Total Incidents</div>
          <div className="kpi-value info">{data.totalIncidents}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Resolved</div>
          <div className="kpi-value success">{data.resolvedIncidents}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">MTTA</div>
          <div className="kpi-value">{formatSeconds(data.mtta)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">MTTR</div>
          <div className="kpi-value">{formatSeconds(data.mttr)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Alert Noise</div>
          <div className={`kpi-value ${data.alertNoise > 50 ? 'warning' : ''}`}>{data.alertNoise}%</div>
          <div className="kpi-unit">Duplicates + Suppressed</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Delivery Success</div>
          <div className={`kpi-value ${data.deliverySuccessRate >= 95 ? 'success' : 'warning'}`}>{data.deliverySuccessRate}%</div>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 24 }}>
        {/* Incidents by Service */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: 16 }}>Incidents by Service</div>
          {data.incidentsByService.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={data.incidentsByService}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-secondary)" />
                <XAxis dataKey="name" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
                <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
                <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-primary)', borderRadius: 8, color: 'var(--text-primary)' }} />
                <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-muted text-sm">No data yet.</p>}
        </div>

        {/* Incidents by Severity */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: 16 }}>Incidents by Severity</div>
          {data.incidentsBySeverity.length > 0 ? (
            <div className="flex items-center" style={{ gap: 24 }}>
              <ResponsiveContainer width="50%" height={200}>
                <PieChart>
                  <Pie data={data.incidentsBySeverity} dataKey="count" nameKey="severity" cx="50%" cy="50%" outerRadius={80}>
                    {data.incidentsBySeverity.map(entry => (
                      <Cell key={entry.severity} fill={SEVERITY_COLORS[entry.severity] || '#6366f1'} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-primary)', borderRadius: 8, color: 'var(--text-primary)' }} />
                </PieChart>
              </ResponsiveContainer>
              <div>
                {data.incidentsBySeverity.map(s => (
                  <div key={s.severity} className="flex items-center gap-2" style={{ marginBottom: 8 }}>
                    <div style={{ width: 12, height: 12, borderRadius: 3, background: SEVERITY_COLORS[s.severity] || '#6366f1' }} />
                    <span style={{ textTransform: 'capitalize', fontSize: 13 }}>{s.severity}</span>
                    <span style={{ fontWeight: 700, marginLeft: 'auto' }}>{s.count}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : <p className="text-muted text-sm">No data yet.</p>}
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 24 }}>
        {/* Alerts by Day */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: 16 }}>Alerts (Last 7 Days)</div>
          {data.alertsByDay.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.alertsByDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-secondary)" />
                <XAxis dataKey="day" tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} />
                <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
                <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-primary)', borderRadius: 8, color: 'var(--text-primary)' }} />
                <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-muted text-sm">No data yet.</p>}
        </div>

        {/* Incidents by Team */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: 16 }}>Incidents by Team</div>
          {data.incidentsByTeam.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.incidentsByTeam} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-secondary)" />
                <XAxis type="number" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} width={100} />
                <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-primary)', borderRadius: 8, color: 'var(--text-primary)' }} />
                <Bar dataKey="count" fill="#10b981" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-muted text-sm">No data yet.</p>}
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid-3">
        <div className="card">
          <div className="card-title" style={{ marginBottom: 12 }}>Alert Breakdown</div>
          <div style={{ display: 'grid', gap: 8 }}>
            <div className="flex items-center justify-between"><span className="text-muted">Warning</span><span className="font-bold">{data.warningAlerts}</span></div>
            <div className="flex items-center justify-between"><span className="text-muted">Info</span><span className="font-bold">{data.infoAlerts}</span></div>
            <div className="flex items-center justify-between"><span className="text-muted">Duplicates</span><span className="font-bold">{data.duplicateAlerts}</span></div>
            <div className="flex items-center justify-between"><span className="text-muted">Suppressed</span><span className="font-bold">{data.suppressedAlerts}</span></div>
          </div>
        </div>
        <div className="card">
          <div className="card-title" style={{ marginBottom: 12 }}>Response Metrics</div>
          <div style={{ display: 'grid', gap: 8 }}>
            <div className="flex items-center justify-between"><span className="text-muted">Escalations</span><span className="font-bold">{data.escalations}</span></div>
            <div className="flex items-center justify-between"><span className="text-muted">Resolution Rate</span><span className="font-bold">{data.resolutionRate}%</span></div>
            <div className="flex items-center justify-between"><span className="text-muted">Escalation Rate</span><span className="font-bold">{data.escalationRate}%</span></div>
          </div>
        </div>
        <div className="card">
          <div className="card-title" style={{ marginBottom: 12 }}>Delivery Stats</div>
          <div style={{ display: 'grid', gap: 8 }}>
            <div className="flex items-center justify-between"><span className="text-muted">Total</span><span className="font-bold">{data.totalDeliveries}</span></div>
            <div className="flex items-center justify-between"><span className="text-muted">Successful</span><span className="font-bold" style={{ color: 'var(--success)' }}>{data.successDeliveries}</span></div>
            <div className="flex items-center justify-between"><span className="text-muted">Failed</span><span className="font-bold" style={{ color: 'var(--critical)' }}>{data.failedDeliveries}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
