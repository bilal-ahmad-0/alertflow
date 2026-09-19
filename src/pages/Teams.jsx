import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useNavigate } from 'react-router-dom';
import { Users, AlertTriangle, BellRing } from 'lucide-react';

export default function Teams() {
  const navigate = useNavigate();
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getTeams().then(setTeams).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading-spinner"><div className="spinner" /></div>;

  return (
    <div>
      <div className="page-header">
        <h1>Teams</h1>
        <p>Engineering teams, members, and responsibilities.</p>
      </div>

      <div className="grid-auto">
        {teams.map(team => (
          <div key={team.id} className="card">
            <div style={{ fontWeight: 600, fontSize: 16, color: 'var(--text-primary)', marginBottom: 2 }}>{team.name}</div>
            <div className="text-xs text-muted" style={{ marginBottom: 16 }}>{team.description}</div>

            <div className="flex gap-3" style={{ marginBottom: 16 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontWeight: 700, fontSize: 20, color: 'var(--text-primary)' }}>{team.member_count}</div>
                <div className="text-xs text-muted">Members</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontWeight: 700, fontSize: 20, color: team.open_incidents > 0 ? 'var(--critical)' : 'var(--text-primary)' }}>
                  {team.open_incidents}
                </div>
                <div className="text-xs text-muted">Open Incidents</div>
              </div>
            </div>

            {/* On-call */}
            {team.oncall && (
              <div style={{ marginBottom: 12 }}>
                <div className="text-xs text-muted flex items-center gap-1" style={{ marginBottom: 6 }}>
                  <BellRing size={12} /> Current On-Call
                </div>
                <div className="flex items-center gap-2">
                  <div style={{ width: 24, height: 24, borderRadius: '50%', background: team.oncall.primary?.avatar_color || 'var(--brand-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 10, fontWeight: 600 }}>
                    {team.oncall.primary?.name?.split(' ').map(n => n[0]).join('')}
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{team.oncall.primary?.name}</span>
                </div>
              </div>
            )}

            {/* Members */}
            <div>
              <div className="text-xs text-muted" style={{ marginBottom: 6 }}>Members</div>
              <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                {(team.members || []).map(m => (
                  <div key={m.id} className="flex items-center gap-2" style={{ padding: '4px 8px', background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
                    <div style={{ width: 20, height: 20, borderRadius: '50%', background: m.avatar_color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 9, fontWeight: 600 }}>
                      {m.name?.split(' ').map(n => n[0]).join('')}
                    </div>
                    {m.name}
                    {m.team_role === 'lead' && <span className="badge brand" style={{ fontSize: 9, padding: '0 4px' }}>Lead</span>}
                    {m.team_role === 'manager' && <span className="badge warning" style={{ fontSize: 9, padding: '0 4px' }}>Manager</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
