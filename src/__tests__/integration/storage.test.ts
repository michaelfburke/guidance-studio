import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import {
  saveRunMeta,
  loadRunMeta,
  saveRunSteps,
  loadRunSteps,
  saveRunOutput,
  loadRunOutput,
  saveRunEvents,
  loadRunEvents,
  loadRunData,
  listRuns,
  deleteRun,
  type RunMeta,
  type RunStep,
  type RunEvent,
} from '../../main/storage'

// Must match what the electron mock returns for app.getPath('home')
const TEST_HOME = path.join(os.tmpdir(), 'guidance-studio-test')
const TEST_RUNS_DIR = path.join(TEST_HOME, 'GuidanceStudio', 'runs')

function makeRunMeta(id: string, overrides: Partial<RunMeta> = {}): RunMeta {
  return {
    id,
    mode: 'agent',
    provider: 'claude',
    productName: 'Test Product',
    feature: 'Login',
    goal: 'Test the login flow',
    url: 'https://example.com',
    status: 'completed',
    createdAt: new Date().toISOString(),
    stepCount: 0,
    ...overrides,
  }
}

beforeEach(() => {
  // Clean out any run directories from previous tests
  if (fs.existsSync(TEST_RUNS_DIR)) {
    const entries = fs.readdirSync(TEST_RUNS_DIR)
    for (const entry of entries) {
      fs.rmSync(path.join(TEST_RUNS_DIR, entry), { recursive: true, force: true })
    }
  }
})

afterAll(() => {
  fs.rmSync(TEST_HOME, { recursive: true, force: true })
})

describe('saveRunMeta / loadRunMeta', () => {
  it('round-trips a RunMeta to disk', () => {
    const meta = makeRunMeta('run-001')
    saveRunMeta(meta)
    const loaded = loadRunMeta('run-001')
    expect(loaded).toEqual(meta)
  })

  it('returns null for a missing run id', () => {
    expect(loadRunMeta('does-not-exist')).toBeNull()
  })

  it('returns null when meta.json contains invalid JSON', () => {
    const runDir = path.join(TEST_RUNS_DIR, 'bad-run')
    fs.mkdirSync(runDir, { recursive: true })
    fs.writeFileSync(path.join(runDir, 'meta.json'), 'not-json')
    expect(loadRunMeta('bad-run')).toBeNull()
  })

  it('creates the run directory recursively if absent', () => {
    const meta = makeRunMeta('run-new')
    expect(fs.existsSync(path.join(TEST_RUNS_DIR, 'run-new'))).toBe(false)
    saveRunMeta(meta)
    expect(fs.existsSync(path.join(TEST_RUNS_DIR, 'run-new', 'meta.json'))).toBe(true)
  })
})

describe('saveRunSteps / loadRunSteps', () => {
  it('round-trips RunStep[] to disk', () => {
    saveRunMeta(makeRunMeta('run-steps'))
    const steps: RunStep[] = [
      { index: 0, title: 'Step 1', description: 'Desc 1', screenshotPath: null, thumbnailPath: null },
      { index: 1, title: 'Step 2', description: 'Desc 2', screenshotPath: '/path/img.png', thumbnailPath: null, excluded: true },
    ]
    saveRunSteps('run-steps', steps)
    const loaded = loadRunSteps('run-steps')
    expect(loaded).toEqual(steps)
  })

  it('returns empty array for missing run', () => {
    expect(loadRunSteps('no-such-run')).toEqual([])
  })

  it('returns empty array for corrupt steps.json', () => {
    const runDir = path.join(TEST_RUNS_DIR, 'corrupt-steps')
    fs.mkdirSync(runDir, { recursive: true })
    fs.writeFileSync(path.join(runDir, 'steps.json'), '{broken')
    expect(loadRunSteps('corrupt-steps')).toEqual([])
  })
})

describe('saveRunOutput / loadRunOutput', () => {
  it('round-trips markdown output', () => {
    saveRunMeta(makeRunMeta('run-docs'))
    const md = '# My Guide\n\nStep 1: Do something.'
    saveRunOutput('run-docs', md)
    expect(loadRunOutput('run-docs')).toBe(md)
  })

  it('returns null when output.md does not exist', () => {
    saveRunMeta(makeRunMeta('run-no-output'))
    expect(loadRunOutput('run-no-output')).toBeNull()
  })
})

describe('saveRunEvents / loadRunEvents', () => {
  it('round-trips RunEvent[] to disk', () => {
    saveRunMeta(makeRunMeta('run-events'))
    const events: RunEvent[] = [
      { runId: 'run-events', type: 'nav', message: 'Navigating', timestamp: 1000 },
      { runId: 'run-events', type: 'click', message: 'Clicking button', timestamp: 2000 },
    ]
    saveRunEvents('run-events', events)
    expect(loadRunEvents('run-events')).toEqual(events)
  })

  it('returns empty array when events.json is missing', () => {
    expect(loadRunEvents('no-events-run')).toEqual([])
  })
})

describe('loadRunData', () => {
  it('returns null when meta is missing', () => {
    expect(loadRunData('phantom-run')).toBeNull()
  })

  it('returns composite RunData when meta exists', () => {
    const meta = makeRunMeta('run-full')
    saveRunMeta(meta)
    const steps: RunStep[] = [
      { index: 0, title: 'S1', description: '', screenshotPath: null, thumbnailPath: null },
    ]
    saveRunSteps('run-full', steps)

    const data = loadRunData('run-full')
    expect(data).not.toBeNull()
    expect(data!.meta).toEqual(meta)
    expect(data!.steps).toEqual(steps)
    expect(data!.outputMd).toBeNull()
  })
})

describe('listRuns', () => {
  it('returns empty array when runs directory does not exist', () => {
    // TEST_RUNS_DIR is cleaned in beforeEach; remove it entirely
    if (fs.existsSync(TEST_RUNS_DIR)) {
      fs.rmSync(TEST_RUNS_DIR, { recursive: true, force: true })
    }
    expect(listRuns()).toEqual([])
  })

  it('sorts runs by createdAt descending', () => {
    const older = makeRunMeta('run-older', { createdAt: '2024-01-01T00:00:00.000Z' })
    const newer = makeRunMeta('run-newer', { createdAt: '2024-06-01T00:00:00.000Z' })
    saveRunMeta(older)
    saveRunMeta(newer)

    const runs = listRuns()
    expect(runs[0].id).toBe('run-newer')
    expect(runs[1].id).toBe('run-older')
  })

  it('skips directories without valid meta.json', () => {
    const runDir = path.join(TEST_RUNS_DIR, 'invalid-run')
    fs.mkdirSync(runDir, { recursive: true })
    // No meta.json

    const runs = listRuns()
    expect(runs.find(r => r.id === 'invalid-run')).toBeUndefined()
  })
})

describe('deleteRun', () => {
  it('removes the run directory and returns true', () => {
    const meta = makeRunMeta('run-to-delete')
    saveRunMeta(meta)
    expect(fs.existsSync(path.join(TEST_RUNS_DIR, 'run-to-delete'))).toBe(true)

    const result = deleteRun('run-to-delete')
    expect(result).toBe(true)
    expect(fs.existsSync(path.join(TEST_RUNS_DIR, 'run-to-delete'))).toBe(false)
  })

  it('returns true for a non-existent run (force delete is a no-op)', () => {
    // fs.rmSync with force:true does not throw for missing paths
    const result = deleteRun('ghost-run')
    expect(result).toBe(true)
  })
})
