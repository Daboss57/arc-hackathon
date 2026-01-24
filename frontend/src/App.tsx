import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ChatWindow } from './components/ChatWindow';
import { LandingPage } from './components/LandingPage';
import { LoginPage } from './components/LoginPage';
import { SettingsPage } from './components/SettingsPage';
import { TopNav } from './components/TopNav';
import { supabase } from './lib/supabaseClient';
import { DEFAULT_SETTINGS, fetchUserSettings, loadLocalSettings, saveLocalSettings, type UserSettings } from './lib/userSettings';
import './App.css';

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [activeView, setActiveView] = useState<'dashboard' | 'settings'>('dashboard');
  const [settings, setSettings] = useState<UserSettings | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (!session?.user?.id) {
      setSettings(null);
      return;
    }
    const load = async () => {
      const data = await fetchUserSettings(session.user.id);
      if (!active) return;
      const local = loadLocalSettings(session.user.id);
      if (data) {
        const merged = { ...DEFAULT_SETTINGS, ...local, ...data, user_id: session.user.id };
        setSettings(merged);
        saveLocalSettings(merged);
      } else if (local) {
        const merged = { ...DEFAULT_SETTINGS, ...local, user_id: session.user.id };
        setSettings(merged);
      } else {
        const merged = { ...DEFAULT_SETTINGS, user_id: session.user.id };
        setSettings(merged);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [session?.user?.id]);

  useEffect(() => {
  if (!settings?.ui_scale) return;
  document.documentElement.style.setProperty('--ui-scale', String(settings.ui_scale));
}, [settings?.ui_scale]);

  const handleSettingsChange = (next: UserSettings) => {
    setSettings(next);
    saveLocalSettings(next);
  };

  // Not logged in - show landing or auth
  if (!session) {
    if (showAuth) {
      return (
        <div className="app">
          <LoginPage onBackToLanding={() => setShowAuth(false)} />
        </div>
      );
    }
    return <LandingPage onGetStarted={() => setShowAuth(true)} />;
  }

  const userLabel = settings?.display_name || session.user.email || 'User';

  const handleSignOut = async () => {
    // Clear local state first
    setSession(null);
    setShowAuth(false);
    setSettings(null);
    // Then try to sign out from Supabase (ignore errors)
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch {
      // Ignore - we've already cleared local state
    }
  };

  return (
    <div className="app">
      <div className="app-shell">
        <TopNav
          activeView={activeView}
          onNavigate={setActiveView}
          userLabel={userLabel}
          onSignOut={handleSignOut}
        />
        <div className="app-body">
          {activeView === 'dashboard' ? (
            <ChatWindow userId={session.user.id} defaultMonthlyBudget={settings?.monthly_budget} />
          ) : (
            <SettingsPage
              userId={session.user.id}
              userEmail={session.user.email}
              settings={settings || undefined}
              onSettingsChange={handleSettingsChange}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
