import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { Network, FolderKanban, LogOut, Plus } from 'lucide-react';
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
    <header className="h-13 bg-[#0a0a0a] border-b border-[#1f1f1f] flex items-center justify-between px-4 sm:px-6 z-30 shrink-0 select-none">
      {/* Brand logo */}
      <div className="flex items-center gap-6">
        <Link to="/dashboard" className="flex items-center gap-2.5 group">
          <div className="w-7 h-7 rounded-md bg-white text-black flex items-center justify-center font-bold">
            <Network className="w-4 h-4 text-black stroke-[2.5]" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-white tracking-tight flex items-center gap-1.5">
              NexusGraph
              <span className="text-[9px] px-1 py-0.2 rounded bg-[#1c1c1c] text-[#a1a1a1] border border-[#2b2b2b] uppercase font-mono">
                OSINT
              </span>
            </span>
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
                className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-colors ${
                  active
                    ? 'bg-[#181818] text-white border border-[#2c2c2c]'
                    : 'text-[#888888] hover:text-[#ededed] hover:bg-[#141414]'
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

        <div className="h-4 w-[1px] bg-[#222222] mx-1" />

        {/* User profile dropdown / signout */}
        <div className="flex items-center gap-2">
          <div className="hidden lg:flex flex-col text-right text-xs">
            <span className="text-neutral-200 font-medium truncate max-w-[140px]">
              {user?.email?.split('@')[0]}
            </span>
            <span className="text-[10px] text-neutral-500 truncate max-w-[140px]">
              {user?.email}
            </span>
          </div>
          <button
            onClick={handleLogout}
            className="p-1.5 rounded text-neutral-400 hover:text-white hover:bg-[#1c1c1c] transition-colors cursor-pointer"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
