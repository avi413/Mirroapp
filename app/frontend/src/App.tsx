import { useEffect, useState } from 'react';
import { Api } from './api';
import { CameraStatus, StepDescriptor } from './types';
import { useSessionStore } from './store/useSessionStore';
import { StatusCard } from './components/StatusCard';
import { StepCard } from './components/StepCard';

const steps: StepDescriptor[] = [
  { title: 'Welcome Screen', subtitle: 'Show LOOQA logo, QR gallery link, and entry button', cta: 'Let’s go' },
  { title: 'Capture Mode', subtitle: 'Guest selects Classic, AI Portrait, Collage, or Boomerang (soon)' },
  { title: 'AI Style', subtitle: 'Display curated style cards + freestyle prompt', cta: 'Choose style' },
  { title: 'LiveView + Timer', subtitle: 'Canon feed with animated countdown & voice cues', cta: 'Start timer' },
  { title: 'Processing', subtitle: 'AI + template renderer progress with playful copy' },
  { title: 'Template Select', subtitle: 'Offer 4x6, dual 2x6, or custom brand layouts' },
  { title: 'Print & Share', subtitle: 'Instant HiTi print + QR / SMS / Email share', cta: 'Print now' },
  { title: 'Encore', subtitle: 'Completion screen invites another session + shows gallery QR' },
];

export default function App() {
  const [camera, setCamera] = useState<CameraStatus | null>(null);
  const session = useSessionStore((state) => state.session);
  const loading = useSessionStore((state) => state.loading);
  const fetchSession = useSessionStore((state) => state.fetchSession);

  useEffect(() => {
    Api.getCameraStatus()
      .then(setCamera)
      .catch((err) => console.error(err));
    fetchSession().catch((err) => console.error(err));
  }, [fetchSession]);

  return (
    <div className="min-h-screen p-8 text-white">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-white/60">Event Mirror Suite</p>
          <h1 className="text-4xl font-extrabold mt-2">LOOQA Mirror</h1>
        </div>
        <div className="text-right">
          <p className="text-sm text-white/60">Next Gen Interactive Selfie Mirror</p>
          <p className="text-xl font-semibold text-brand">Edge + AI Ready</p>
        </div>
      </header>

      <section className="mt-10 grid gap-6 md:grid-cols-3">
        <StatusCard
          title="Camera"
          value={
            camera
              ? `${camera.connected ? 'Online' : 'Offline'}${camera.model ? ` · ${camera.model}` : ''}`
              : 'Checking...'
          }
          hint={camera?.liveView ? 'LiveView streaming' : 'LiveView idle'}
        />
        <StatusCard
          title="Active Session"
          value={session ? session.name : 'No event loaded'}
          hint={session ? `${session.theme} · ${session.date}` : 'Start a new session from admin'}
        />
        <StatusCard title="AI Engine" value="Gemini Nano" hint="Parallel jobs < 8s target" />
      </section>

      <section className="mt-12 grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-white/10 p-6 bg-white/5">
          <h2 className="text-2xl font-semibold">LiveView Preview</h2>
          <p className="text-white/60 mt-2 text-sm">
            WebSocket JPEG stream at 15fps. Mirror UI overlays timer, prompts, and guidance animations.
          </p>
          <div className="mt-6 aspect-video rounded-2xl bg-black/60 flex items-center justify-center text-white/40 text-lg">
            {camera?.liveView ? 'Streaming Canon feed…' : 'LiveView idle – tap start from mirror UI'}
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 p-6 bg-white/5">
          <h2 className="text-2xl font-semibold">Session Controls</h2>
          <p className="text-white/60 mt-2 text-sm">
            Manage event presets, AI toggles, and template options via the admin panel running on tablet or backstage display.
          </p>
          <ul className="mt-6 space-y-4 text-white/80">
            <li>• Theme & branding (logos, colors, overlays)</li>
            <li>• Template combinations (4×6, dual 2×6, custom frames)</li>
            <li>• AI thresholds, freestyle prompt permissions, intensity caps</li>
            <li>• Print policy (copies per guest, retries, digital gallery sync)</li>
            <li>• Cloud backup + auto purge after event reset</li>
          </ul>
          <button className="mt-6 px-5 py-3 rounded-full bg-brand text-black font-semibold">
            {loading ? 'Syncing…' : 'Open Admin Panel'}
          </button>
        </div>
      </section>

      <section className="mt-12">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold">Guest Journey</h2>
          <span className="text-sm uppercase tracking-[0.3em] text-white/60">63″ mirror UI</span>
        </div>
        <div className="mt-6 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {steps.map((step, index) => (
            <StepCard step={step} index={index} key={step.title} />
          ))}
        </div>
      </section>
    </div>
  );
}
