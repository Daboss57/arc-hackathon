import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ChatWindow } from './components/ChatWindow';
import { LoginPage } from './components/LoginPage';
import { SettingsPage } from './components/SettingsPage';
import { TopNav } from './components/TopNav';
import { supabase } from './lib/supabaseClient';
import { DEFAULT_SETTINGS, fetchUserSettings, loadLocalSettings, saveLocalSettings, type UserSettings } from './lib/userSettings';
import './App.css';

function App() {
  const [session, setSession] = useState<Session | null>(null);
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

  if (!session) {
    return (
      <div className="app">
        <LoginPage />
      </div>
    );
  }

  const userLabel = settings?.display_name || session.user.email || 'User';

  return (
    <div className="app">
      <div className="app-shell">
        <TopNav
          activeView={activeView}
          onNavigate={setActiveView}
          userLabel={userLabel}
          onSignOut={() => supabase.auth.signOut()}
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
