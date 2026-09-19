import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { Server, CheckCircle2 } from 'lucide-react';

export default function Services() {
  const navigate = useNavigate();
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getServices().then(setServices).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading-spinner"><div className="spinner" /></div>;

  return (
    <div>
      <div className="page-header">
        <h1>Services</h1>
        <p>Service catalog and health status.</p>
      </div>

      <div className="grid-auto">
        {services.map(svc => (
          <div key={svc.id} className="card" style={{ cursor: 'pointer' }} onClick={() => navigate(`/services/${svc.id}`)}>
            <div className="flex items-center gap-3" style={{ marginBottom: 12 }}>
              <span className={`status-dot ${svc.status}`} style={{ width: 10, height: 10 }} />
              <div>
                <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-primary)' }}>{svc.name}</div>
                <div className="text-xs text-muted">{svc.description}</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <span className="text-xs text-muted">Status</span>
                <div><span className={`badge ${svc.status === 'healthy' ? 'success' : svc.status === 'degraded' ? 'warning' : svc.status === 'down' ? 'critical' : 'neutral'}`}>{svc.status}</span></div>
              </div>
              <div>
                <span className="text-xs text-muted">Owner</span>
                <div style={{ fontSize: 13 }}>{svc.team_name || '—'}</div>
              </div>
              <div>
                <span className="text-xs text-muted">Open Incidents</span>
                <div style={{ fontWeight: 600, color: svc.open_incidents > 0 ? 'var(--critical)' : 'var(--text-primary)' }}>{svc.open_incidents}</div>
              </div>
              <div>
                <span className="text-xs text-muted">Alerts Today</span>
                <div style={{ fontWeight: 600 }}>{svc.alerts_today}</div>
              </div>
            </div>
            <div style={{ marginTop: 8 }}>
              <span className="badge neutral">{svc.environment}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
