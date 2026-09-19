import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { Routes, Route, useNavigate, useLocation, Link } from 'react-router-dom';
import { api, onWsMessage } from './api/client';
import {
  LayoutDashboard, AlertTriangle, Bell, Server, Activity,
  Shield, Clock, Users, Radio, Link2, BarChart3, FileText, Settings,
  Search, ChevronDown, Zap, Menu, X, BellRing
} from 'lucide-react';

import Dashboard from './pages/Dashboard';
import Incidents from './pages/Incidents';
import IncidentDetail from './pages/IncidentDetail';
import Alerts from './pages/Alerts';
import Services from './pages/Services';
import ServiceDetail from './pages/ServiceDetail';
import Monitoring from './pages/Monitoring';
import AlertRules from './pages/AlertRules';
import EscalationPolicies from './pages/EscalationPolicies';
import OnCall from './pages/OnCall';
import Teams from './pages/Teams';
import Destinations from './pages/Destinations';
import Analytics from './pages/Analytics';
import AuditLog from './pages/AuditLog';
import SettingsPage from './pages/Settings';

// Toast context
export const ToastContext = createContext();

export function useToast() {
  return useContext(ToastContext);
}

function App() {
  const location = useLocation();
  const navigate = useNavigate();

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [criticalCount, setCriticalCount] = useState(0);
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  // Load notifications
  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.getNotifications();
        setNotifications(data.notifications);
        setUnreadCount(data.unreadCount);
      } catch {}
    };
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, []);

  // Load critical count
  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.getDashboard();
        setCriticalCount(data.kpis.criticalIncidents || 0);
      } catch {}
    };
    load();
  }, [location]);

  // WebSocket listener
  useEffect(() => {
    return onWsMessage((data) => {
      if (data.type === 'notification') {
        setNotifications(prev => [data.notification, ...prev]);
        setUnreadCount(prev => prev + 1);
      }
      if (data.type === 'incident_created' || data.type === 'incident_updated') {
        // Refresh critical count
        api.getDashboard().then(d => setCriticalCount(d.kpis.criticalIncidents || 0)).catch(() => {});
      }
    });
  }, []);

  // Search
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults(null); return; }
    const timer = setTimeout(async () => {
      try {
        const results = await api.search(searchQuery);
        setSearchResults(results);
      } catch {}
    }, 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Keyboard shortcut for search
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === 'Escape') {
        setSearchOpen(false);
        setNotifOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const markAllRead = async () => {
    try {
      await api.markAllNotificationsRead();
      setNotifications(prev => prev.map(n => ({ ...n, read: 1 })));
      setUnreadCount(0);
    } catch {}
  };

  const navItems = [
    { path: '/', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/incidents', label: 'Incidents', icon: AlertTriangle, badge: criticalCount || null },
    { path: '/alerts', label: 'Alerts', icon: Zap },
    { path: '/services', label: 'Services', icon: Server },
    { path: '/monitoring', label: 'Monitoring', icon: Activity },
    { divider: true, label: 'Configuration' },
    { path: '/rules', label: 'Alert Rules', icon: Shield },
    { path: '/escalation-policies', label: 'Escalation Policies', icon: Clock },
    { path: '/oncall', label: 'On-Call', icon: BellRing },
    { path: '/teams', label: 'Teams', icon: Users },
    { divider: true, label: 'Integrations' },
    { path: '/destinations', label: 'Destinations', icon: Radio },
    { divider: true, label: 'Insights' },
    { path: '/analytics', label: 'Analytics', icon: BarChart3 },
    { path: '/audit-log', label: 'Audit Log', icon: FileText },
    { divider: true, label: 'System' },
    { path: '/settings', label: 'Settings', icon: Settings },
  ];

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const systemStatus = criticalCount > 0 ? 'critical' : 'operational';

  return (
    <ToastContext.Provider value={addToast}>
      <div className="app-layout">
        {/* Sidebar */}
        <nav className="sidebar">
          <div className="sidebar-logo">
            <div className="sidebar-logo-icon">A</div>
            <span className="sidebar-logo-text">AlertOps</span>
          </div>
          <div className="sidebar-nav">
            {navItems.map((item, i) =>
              item.divider ? (
                <div key={i} className="sidebar-section-label">{item.label}</div>
              ) : (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`sidebar-item ${isActive(item.path) ? 'active' : ''}`}
                >
                  <item.icon className="icon" size={18} />
                  <span>{item.label}</span>
                  {item.badge && <span className="badge">{item.badge}</span>}
                </Link>
              )
            )}
          </div>
        </nav>

        {/* Main content */}
        <div className="main-content">
          {/* Top bar */}
          <header className="topbar">
            <div className="topbar-search">
              <Search className="search-icon" size={16} />
              <input
                placeholder="Search incidents, alerts, services... (Ctrl+K)"
                value=""
                onFocus={() => setSearchOpen(true)}
                readOnly
              />
            </div>

            <div className={`topbar-status ${systemStatus}`}>
              <span className="dot" />
              <span>
                {systemStatus === 'operational' ? 'All Systems Operational'
                  : `${criticalCount} Critical Incident${criticalCount > 1 ? 's' : ''}`}
              </span>
            </div>

            <div className="topbar-right">
              <button className="topbar-btn" onClick={() => setNotifOpen(!notifOpen)} title="Notifications">
                <Bell size={18} />
                {unreadCount > 0 && <span className="notif-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
              </button>
              <div className="topbar-user">
                <div className="topbar-avatar" style={{ background: '#6366f1' }}>AK</div>
                <span className="topbar-user-name">Ahmed Khan</span>
              </div>
            </div>
          </header>

          {/* Page content */}
          <div className="page-content">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/incidents" element={<Incidents />} />
              <Route path="/incidents/:id" element={<IncidentDetail />} />
              <Route path="/alerts" element={<Alerts />} />
              <Route path="/services" element={<Services />} />
              <Route path="/services/:id" element={<ServiceDetail />} />
              <Route path="/monitoring" element={<Monitoring />} />
              <Route path="/rules" element={<AlertRules />} />
              <Route path="/escalation-policies" element={<EscalationPolicies />} />
              <Route path="/oncall" element={<OnCall />} />
              <Route path="/teams" element={<Teams />} />
              <Route path="/destinations" element={<Destinations />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/audit-log" element={<AuditLog />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </div>
        </div>

        {/* Search modal */}
        {searchOpen && (
          <div className="search-overlay" onClick={() => setSearchOpen(false)}>
            <div className="search-modal" onClick={(e) => e.stopPropagation()}>
              <input
                placeholder="Search incidents, alerts, services, teams, rules..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
              />
              <div className="search-results">
                {searchResults && (
                  <>
                    {searchResults.incidents?.length > 0 && (
                      <div className="search-result-group">
                        <h4>Incidents</h4>
                        {searchResults.incidents.map(inc => (
                          <div key={inc.id} className="search-result-item" onClick={() => { navigate(`/incidents/${inc.id}`); setSearchOpen(false); setSearchQuery(''); }}>
                            <span className={`badge ${inc.severity}`} style={{ marginRight: 8 }}>{inc.severity}</span>
                            INC-{inc.incident_number} — {inc.title}
                          </div>
                        ))}
                      </div>
                    )}
                    {searchResults.services?.length > 0 && (
                      <div className="search-result-group">
                        <h4>Services</h4>
                        {searchResults.services.map(svc => (
                          <div key={svc.id} className="search-result-item" onClick={() => { navigate(`/services/${svc.id}`); setSearchOpen(false); setSearchQuery(''); }}>
                            {svc.name}
                          </div>
                        ))}
                      </div>
                    )}
                    {searchResults.teams?.length > 0 && (
                      <div className="search-result-group">
                        <h4>Teams</h4>
                        {searchResults.teams.map(team => (
                          <div key={team.id} className="search-result-item" onClick={() => { navigate('/teams'); setSearchOpen(false); setSearchQuery(''); }}>
                            {team.name}
                          </div>
                        ))}
                      </div>
                    )}
                    {searchResults.rules?.length > 0 && (
                      <div className="search-result-group">
                        <h4>Alert Rules</h4>
                        {searchResults.rules.map(rule => (
                          <div key={rule.id} className="search-result-item" onClick={() => { navigate('/rules'); setSearchOpen(false); setSearchQuery(''); }}>
                            {rule.name}
                          </div>
                        ))}
                      </div>
                    )}
                    {Object.values(searchResults).every(arr => arr.length === 0) && (
                      <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
                        No results found for "{searchQuery}"
                      </div>
                    )}
                  </>
                )}
                {!searchResults && !searchQuery && (
                  <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
                    Start typing to search...
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Notification panel */}
        {notifOpen && (
          <>
            <div className="modal-overlay" style={{ background: 'transparent' }} onClick={() => setNotifOpen(false)} />
            <div className="notification-panel">
              <div className="modal-header">
                <h2>Notifications</h2>
                <div className="flex gap-2">
                  {unreadCount > 0 && <button className="btn btn-ghost btn-sm" onClick={markAllRead}>Mark all read</button>}
                  <button className="btn btn-ghost btn-sm" onClick={() => setNotifOpen(false)}><X size={16} /></button>
                </div>
              </div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {notifications.length === 0 ? (
                  <div className="empty-state">
                    <Bell size={32} />
                    <h3>No notifications</h3>
                    <p>You'll see notifications here when events occur.</p>
                  </div>
                ) : (
                  notifications.map(n => (
                    <div key={n.id} className={`notification-item ${n.read ? '' : 'unread'}`}
                      onClick={() => { if (n.link) { navigate(n.link); setNotifOpen(false); } }}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`badge ${n.severity || 'info'}`} style={{ fontSize: 10 }}>{n.type?.replace(/_/g, ' ')}</span>
                        <span className="text-xs text-muted">{new Date(n.created_at).toLocaleTimeString()}</span>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{n.title}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{n.message}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        )}

        {/* Toasts */}
        <div className="toast-container">
          {toasts.map(t => (
            <div key={t.id} className={`toast ${t.type}`}>{t.message}</div>
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

export default App;
