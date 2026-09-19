import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { ArrowLeft, Server, AlertTriangle, Zap, GitBranch } from 'lucide-react';

export default function ServiceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [service, setService] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getService(id).then(setService).catch(console.error).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="loading-spinner"><div className="spinner" /></div>;
  if (!service) return <div className="empty-state"><h3>Service not found</h3></div>;

  return (
    <div>
      <button className="btn btn-ghost btn-sm" onClick={() => navigate('/services')} style={{ marginBottom: 12 }}>
        <ArrowLeft size={16} /> Back to Services
      </button>

      <div className="page-header">
        <div className="flex items-center gap-3">
          <span className={`status-dot ${service.status}`} style={{ width: 12, height: 12 }} />
          <h1>{service.name}</h1>
          <span className={`badge ${service.status === 'healthy' ? 'success' : service.status === 'degraded' ? 'warning' : 'critical'}`}>{service.status}</span>
        </div>
        <p>{service.description}</p>
      </div>

      <div className="grid-2" style={{ marginBottom: 24 }}>
        <div className="card">
          <div className="card-title" style={{ marginBottom: 12 }}>Service Details</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><span className="text-xs text-muted">Owner Team</span><div>{service.team_name || '—'}</div></div>
            <div><span className="text-xs text-muted">Environment</span><div>{service.environment}</div></div>
          </div>
        </div>

        <div className="card">
          <div className="card-title flex items-center gap-2" style={{ marginBottom: 12 }}>
            <GitBranch size={16} /> Dependencies
          </div>
          {service.dependencies?.length > 0 ? (
            <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
              {service.dependencies.map(dep => (
                <button key={dep.id} className="btn btn-secondary btn-sm" onClick={() => navigate(`/services/${dep.id}`)}>
                  <span className={`status-dot ${dep.status}`} /> {dep.name}
                </button>
              ))}
            </div>
          ) : <p className="text-muted text-sm">No dependencies configured.</p>}

          {service.dependents?.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div className="text-xs text-muted" style={{ marginBottom: 6 }}>Depended on by:</div>
              <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                {service.dependents.map(dep => (
                  <button key={dep.id} className="btn btn-secondary btn-sm" onClick={() => navigate(`/services/${dep.id}`)}>
                    {dep.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Upstream warning */}
          {service.dependencies?.some(d => d.status === 'down' || d.status === 'degraded') && (
            <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--warning-bg)', border: '1px solid var(--warning-border)', borderRadius: 'var(--radius-md)', fontSize: 12, color: 'var(--warning-text)' }}>
              ⚠️ Potential upstream dependency issue detected.
            </div>
          )}
        </div>
      </div>

      {/* Incidents */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <div className="card-title flex items-center gap-2"><AlertTriangle size={16} /> Incidents</div>
        </div>
        {service.incidents?.length > 0 ? (
          <table>
            <thead><tr><th>ID</th><th>Title</th><th>Severity</th><th>Status</th></tr></thead>
            <tbody>
              {service.incidents.map(inc => (
                <tr key={inc.id} onClick={() => navigate(`/incidents/${inc.id}`)}>
                  <td className="font-mono">INC-{inc.incident_number}</td>
                  <td>{inc.title}</td>
                  <td><span className={`badge ${inc.severity}`}>{inc.severity}</span></td>
                  <td><span className={`badge ${inc.status === 'resolved' ? 'success' : inc.status === 'triggered' ? 'critical' : 'info'}`}>{inc.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="text-muted text-sm">No incidents for this service.</p>}
      </div>

      {/* Recent alerts */}
      <div className="card">
        <div className="card-header">
          <div className="card-title flex items-center gap-2"><Zap size={16} /> Recent Alerts</div>
        </div>
        {service.alerts?.length > 0 ? (
          <table>
            <thead><tr><th>Type</th><th>Severity</th><th>Description</th><th>Time</th></tr></thead>
            <tbody>
              {service.alerts.slice(0, 20).map(a => (
                <tr key={a.id}>
                  <td>{a.event_type}</td>
                  <td><span className={`badge ${a.severity}`}>{a.severity}</span></td>
                  <td>{a.description}</td>
                  <td className="font-mono text-xs">{new Date(a.timestamp).toLocaleTimeString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="text-muted text-sm">No recent alerts.</p>}
      </div>
    </div>
  );
}
