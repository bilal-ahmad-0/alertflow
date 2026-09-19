import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { BellRing, Clock, User } from 'lucide-react';

export default function OnCall() {
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getOnCall().then(setSchedules).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading-spinner"><div className="spinner" /></div>;

  return (
    <div>
      <div className="page-header">
        <h1>On-Call</h1>
        <p>Current on-call rotations and schedules across all teams.</p>
      </div>

      {schedules.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="icon-container"><BellRing size={28} /></div>
            <h3>No on-call schedules configured</h3>
            <p>On-call schedules determine who receives notifications for each team.</p>
          </div>
        </div>
      ) : (
        <div className="grid-auto">
          {schedules.map(oc => (
            <div key={oc.id} className="card">
              <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-primary)', marginBottom: 2 }}>{oc.team_name}</div>
              <div className="text-xs text-muted" style={{ marginBottom: 16 }}>{oc.name}</div>

              {/* Current on-call */}
              <div style={{ marginBottom: 12 }}>
                <div className="text-xs text-muted" style={{ marginBottom: 6 }}>Current On-Call</div>
                {oc.primary ? (
                  <div className="flex items-center gap-3" style={{ padding: '8px 12px', background: 'var(--success-bg)', border: '1px solid var(--success-border)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: oc.primary.avatar_color || 'var(--brand-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 600, fontSize: 12 }}>
                      {oc.primary.name?.split(' ').map(n => n[0]).join('')}
                    </div>
                    <div>
                      <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{oc.primary.name}</div>
                      <div className="text-xs text-muted">{oc.primary.email}</div>
                    </div>
                    <span className="badge success" style={{ marginLeft: 'auto' }}>Primary</span>
                  </div>
                ) : <span className="text-muted">Not configured</span>}
              </div>

              {/* Next on-call */}
              {oc.secondary && (
                <div style={{ marginBottom: 12 }}>
                  <div className="text-xs text-muted" style={{ marginBottom: 6 }}>Next On-Call</div>
                  <div className="flex items-center gap-3" style={{ padding: '8px 12px', background: 'var(--bg-tertiary)', border: '1px solid var(--border-secondary)', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: oc.secondary.avatar_color || 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 600, fontSize: 12 }}>
                      {oc.secondary.name?.split(' ').map(n => n[0]).join('')}
                    </div>
                    <div>
                      <div style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{oc.secondary.name}</div>
                      <div className="text-xs text-muted">{oc.secondary.email}</div>
                    </div>
                    <span className="badge neutral" style={{ marginLeft: 'auto' }}>Secondary</span>
                  </div>
                </div>
              )}

              {/* Schedule */}
              <div className="flex items-center gap-2" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                <Clock size={14} /> Shift: {oc.shift_start} — {oc.shift_end}
              </div>

              {/* Rotation */}
              <div style={{ marginTop: 12 }}>
                <div className="text-xs text-muted" style={{ marginBottom: 6 }}>Rotation Members</div>
                <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                  {(oc.resolved_members || []).map(m => (
                    <div key={m.id} className="flex items-center gap-2" style={{ padding: '4px 8px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
                      <div style={{ width: 20, height: 20, borderRadius: '50%', background: m.avatar_color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 9, fontWeight: 600 }}>
                        {m.name?.split(' ').map(n => n[0]).join('')}
                      </div>
                      {m.name}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
