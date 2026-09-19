import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, onWsMessage } from '../api/client';
import {
  AlertTriangle, Zap, Clock, TrendingUp, Activity, Server,
  ArrowUpRight, CheckCircle2, XCircle, Volume2
} from 'lucide-react';

function formatDuration(startStr) {
  if (!startStr) return '—';
  const diff = Date.now() - new Date(startStr).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function formatSeconds(seconds) {
  if (seconds == null) return '—';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m ${seconds % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const d = await api.getDashboard();
      setData(d);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    return onWsMessage(() => {
      setTimeout(load, 300);
    });
  }, []);

  if (loading) return <div className="loading-spinner"><div className="spinner" /></div>;
  if (!data) return null;

  const { kpis, activeIncidents, serviceHealth, recentActivity } = data;

  return (
    <div>
      <div className="page-header">
        <h1>Operational Overview</h1>
        <p>Monitor incidents, alerts, services, and response performance.</p>
      </div>

      {/* KPI Cards */}
      <div className="kpi-grid">
        <div className={`kpi-card ${kpis.openIncidents > 0 ? 'critical' : ''}`} onClick={() => navigate('/incidents')}>
          <div className="kpi-label">Open Incidents</div>
          <div className={`kpi-value ${kpis.openIncidents > 0 ? 'critical' : ''}`}>{kpis.openIncidents}</div>
        </div>
        <div className={`kpi-card ${kpis.criticalIncidents > 0 ? 'critical' : ''}`} onClick={() => navigate('/incidents?severity=critical')}>
          <div className="kpi-label">Critical Incidents</div>
          <div className={`kpi-value ${kpis.criticalIncidents > 0 ? 'critical' : ''}`}>{kpis.criticalIncidents}</div>
        </div>
        <div className="kpi-card" onClick={() => navigate('/alerts')}>
          <div className="kpi-label">Alerts Today</div>
          <div className="kpi-value info">{kpis.alertsToday}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Delivery Success Rate</div>
          <div className={`kpi-value ${kpis.deliverySuccessRate >= 95 ? 'success' : kpis.deliverySuccessRate >= 80 ? 'warning' : 'critical'}`}>
            {kpis.deliverySuccessRate}%
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Mean Time to Acknowledge</div>
          <div className="kpi-value">{formatSeconds(kpis.mtta)}</div>
          <div className="kpi-unit">MTTA</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Mean Time to Resolve</div>
          <div className="kpi-value">{formatSeconds(kpis.mttr)}</div>
          <div className="kpi-unit">MTTR</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Alert Noise</div>
          <div className={`kpi-value ${kpis.alertNoise > 50 ? 'warning' : ''}`}>{kpis.alertNoise}%</div>
          <div className="kpi-unit" title="Percentage of alerts that are duplicates or suppressed">Duplicates + suppressed</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Escalations</div>
          <div className={`kpi-value ${kpis.escalations > 0 ? 'warning' : ''}`}>{kpis.escalations}</div>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 24 }}>
        {/* Active Incidents */}
        <div className="card">
          <div className="card-header">
            <div className="card-title flex items-center gap-2">
              <AlertTriangle size={16} /> Active Incidents
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/incidents')}>
              View all <ArrowUpRight size={14} />
            </button>
          </div>
          {activeIncidents.length === 0 ? (
            <div className="empty-state" style={{ padding: 32 }}>
              <CheckCircle2 size={32} style={{ color: 'var(--success)', marginBottom: 8 }} />
              <h3>No active incidents</h3>
              <p>All systems operational.</p>
            </div>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Incident</th>
                    <th>Severity</th>
                    <th>Service</th>
                    <th>Status</th>
                    <th>Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {activeIncidents.map(inc => (
                    <tr key={inc.id} onClick={() => navigate(`/incidents/${inc.id}`)}>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>INC-{inc.incident_number}</div>
                        <div className="text-xs text-muted truncate" style={{ maxWidth: 200 }}>{inc.title}</div>
                      </td>
                      <td><span className={`badge ${inc.severity}`}>{inc.severity}</span></td>
                      <td style={{ color: 'var(--text-primary)' }}>{inc.service_name || '—'}</td>
                      <td><span className={`badge ${inc.status === 'triggered' ? 'critical' : inc.status === 'acknowledged' ? 'info' : 'neutral'}`}>{inc.status}</span></td>
                      <td className="font-mono text-sm">{formatDuration(inc.started_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Service Health */}
        <div className="card">
          <div className="card-header">
            <div className="card-title flex items-center gap-2">
              <Server size={16} /> Service Health
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/services')}>
              View all <ArrowUpRight size={14} />
            </button>
          </div>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Status</th>
                  <th>Incidents</th>
                  <th>Alerts</th>
                </tr>
              </thead>
              <tbody>
                {serviceHealth.map(svc => (
                  <tr key={svc.id} onClick={() => navigate(`/services/${svc.id}`)}>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className={`status-dot ${svc.status}`} />
                        <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{svc.name}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${svc.status === 'healthy' ? 'success' : svc.status === 'degraded' ? 'warning' : svc.status === 'down' ? 'critical' : 'neutral'}`}>
                        {svc.status}
                      </span>
                    </td>
                    <td>{svc.open_incidents}</td>
                    <td>{svc.alerts_today}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="card">
        <div className="card-header">
          <div className="card-title flex items-center gap-2">
            <Activity size={16} /> Recent Activity
          </div>
        </div>
        {recentActivity.length === 0 ? (
          <div className="empty-state" style={{ padding: 24 }}>
            <Activity size={24} style={{ color: 'var(--text-muted)', marginBottom: 8 }} />
            <p>No recent activity.</p>
          </div>
        ) : (
          <div className="timeline">
            {recentActivity.slice(0, 15).map(event => (
              <div key={event.id} className="timeline-item" style={{ cursor: 'pointer' }}
                onClick={() => navigate(`/incidents/${event.incident_id}`)}>
                <div className={`timeline-dot ${event.type}`} />
                <div className="timeline-time">{new Date(event.timestamp).toLocaleTimeString()}</div>
                <div className="timeline-message">
                  <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>INC-{event.incident_number}</span>
                  {' — '}{event.message}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
