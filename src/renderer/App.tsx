import React, { useState, useEffect } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import HomePage from './pages/HomePage'
import NewRunPage from './pages/NewRunPage'
import RunDetailPage from './pages/RunDetailPage'
import SettingsPage from './pages/SettingsPage'
import { ErrorBoundary } from './components/ErrorBoundary'
import OnboardingModal from './components/OnboardingModal'

function AppShell(): JSX.Element {
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [settingsLoaded, setSettingsLoaded] = useState(false)

  useEffect(() => {
    window.electronAPI.settingsGetAll().then(s => {
      const hasProvider =
        s.claudeApiKeySet ||
        s.geminiApiKeySet ||
        s.openaiApiKeySet ||
        s.openrouterConnected ||
        s.copilotConnected ||
        s.githubModelsApiKeySet
      const onboardingComplete = (s as Record<string, unknown>).onboardingComplete === true
      setShowOnboarding(!hasProvider && !onboardingComplete)
      setSettingsLoaded(true)
    }).catch(() => setSettingsLoaded(true))
  }, [])

  if (!settingsLoaded) return <div className="flex h-screen bg-slate-950" />

  return (
    <>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/runs" replace />} />
          <Route path="runs" element={<HomePage />} />
          <Route path="runs/new" element={<NewRunPage />} />
          <Route path="runs/:runId" element={<RunDetailPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
      {showOnboarding && <OnboardingModal onComplete={() => setShowOnboarding(false)} />}
    </>
  )
}

export default function App(): JSX.Element {
  return (
    <HashRouter>
      <ErrorBoundary>
        <AppShell />
      </ErrorBoundary>
    </HashRouter>
  )
}
