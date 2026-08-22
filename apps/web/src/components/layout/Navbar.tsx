import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { Network, FolderKanban, LogOut, User, Plus } from 'lucide-react';
import { Button } from '../ui/Button';

export function Navbar() {
  const { user, signOut } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    await signOut();
    navigate('/login');
  };

  const navLinks = [
    { path: '/dashboard', label: 'Dashboard', icon: Network },
    { path: '/investigations', label: 'Investigations', icon: FolderKanban },
  ];

  return (
    <header className="h-14 bg-surface border-b border-border-subtle flex items-center justify-between px-4 sm:px-6 z-30 shrink-0">
      {/* Brand logo */}
      <div className="flex items-center gap-6">
        <Link to="/dashboard" className="flex items-center gap-2 select-none group">
          <div className="w-8 h-8 rounded-lg bg-primary/15 border border-primary/40 flex items-center justify-center text-primary group-hover:scale-105 transition-transform">
            <Network className="w-4 h-4" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold text-text tracking-tight flex items-center gap-1">
              NexusGraph
              <span className="text-[9px] px-1 py-0.2 rounded bg-primary/20 text-primary uppercase font-mono">
                OSINT
              </span>
            </span>
            <span className="text-[10px] text-text-muted">Investigation Workspace</span>
          </div>
        </Link>

        {/* Navigation links */}
        <nav className="hidden md:flex items-center gap-1">
          {navLinks.map((link) => {
            const Icon = link.icon;
            const active = location.pathname.startsWith(link.path);
            return (
              <Link
                key={link.path}
                to={link.path}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-button text-xs font-medium transition-colors ${
                  active
                    ? 'bg-surface-2 text-text font-semibold border border-border-subtle'
                    : 'text-text-secondary hover:text-text hover:bg-surface-2/60'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{link.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-2">
        <Button
          variant="primary"
          size="sm"
          icon={<Plus className="w-3.5 h-3.5" />}
          onClick={() => navigate('/investigations/new')}
        >
          <span className="hidden sm:inline">New Case</span>
        </Button>

        <div className="h-5 w-[1px] bg-border-subtle mx-1" />

        {/* User profile dropdown / signout */}
        <div className="flex items-center gap-2">
          <div className="hidden lg:flex flex-col text-right text-xs">
            <span className="text-text font-medium truncate max-w-[140px]">
              {user?.email?.split('@')[0]}
            </span>
            <span className="text-[10px] text-text-muted truncate max-w-[140px]">
              {user?.email}
            </span>
          </div>
          <button
            onClick={handleLogout}
            className="p-2 rounded-button text-text-muted hover:text-status-danger hover:bg-status-danger/10 transition-colors"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
