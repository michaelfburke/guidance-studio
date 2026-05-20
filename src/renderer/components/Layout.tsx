import React, { useState } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'

function GsLogo(): JSX.Element {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="28" height="28" rx="8" fill="url(#logo-grad)" />
      <path d="M8 14C8 10.686 10.686 8 14 8C15.657 8 17.156 8.671 18.243 9.757" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M14 14L18 10" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="14" cy="14" r="2" fill="white" />
      <path d="M14 17V21" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M11 19H17" stroke="white" strokeWidth="2" strokeLinecap="round" />
      <defs>
        <linearGradient id="logo-grad" x1="0" y1="0" x2="28" y2="28" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0ea5e9" />
          <stop offset="1" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
    </svg>
  )
}

function RunsIcon({ className }: { className?: string }): JSX.Element {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="14" height="3" rx="1" />
      <rect x="2" y="8" width="10" height="3" rx="1" />
      <rect x="2" y="13" width="12" height="3" rx="1" />
    </svg>
  )
}

function PlusIcon({ className }: { className?: string }): JSX.Element {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M9 4v10M4 9h10" />
    </svg>
  )
}

function SettingsIcon({ className }: { className?: string }): JSX.Element {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="9" r="2.5" />
      <path d="M9 2v1.5M9 14.5V16M2 9h1.5M14.5 9H16M3.9 3.9l1.1 1.1M13 13l1.1 1.1M3.9 14.1l1.1-1.1M13 5l1.1-1.1" />
    </svg>
  )
}

export default function Layout(): JSX.Element {
  const navigate = useNavigate()
  const location = useLocation()

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 flex flex-col bg-slate-950 border-r border-slate-800/60">
        {/* Logo area */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-slate-800/60 draggable">
          <GsLogo />
          <div>
            <div className="font-semibold text-sm text-slate-100 leading-tight">GuidanceStudio</div>
            <div className="text-xs text-slate-500 leading-tight">v1.0.0</div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          <div className="text-xs font-semibold text-slate-600 uppercase tracking-wider px-2 mb-2">
            Workspace
          </div>

          <NavLink
            to="/runs"
            className={({ isActive }) =>
              `sidebar-item no-drag ${isActive && !location.pathname.startsWith('/runs/new')
                ? 'sidebar-item-active'
                : 'sidebar-item-inactive'
              }`
            }
          >
            <RunsIcon />
            <span>Runs</span>
          </NavLink>

          <button
            onClick={() => navigate('/runs/new')}
            className={`sidebar-item w-full no-drag ${location.pathname === '/runs/new'
              ? 'sidebar-item-active'
              : 'sidebar-item-inactive'
            }`}
          >
            <PlusIcon />
            <span>New Run</span>
          </button>

          <div className="border-t border-slate-800/60 my-3" />

          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `sidebar-item no-drag ${isActive ? 'sidebar-item-active' : 'sidebar-item-inactive'}`
            }
          >
            <SettingsIcon />
            <span>Settings</span>
          </NavLink>
        </nav>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-slate-800/60">
          <div className="text-xs text-slate-600">
            AI Documentation Generator
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-hidden flex flex-col">
        {/* Titlebar for Windows/Linux drag area */}
        <div className="h-8 w-full draggable flex-shrink-0 bg-slate-950" />
        <div className="flex-1 overflow-hidden">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
