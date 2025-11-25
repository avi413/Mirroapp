import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';
import { Api } from './api';
import {
  AiResult,
  BoothStatus,
  CameraSettingsPayload,
  CameraStatus,
  CaptureResponse,
  StepDescriptor,
  TemplateId,
  TemplateResponse,
} from './types';
import { useSessionStore } from './store/useSessionStore';
import { StatusCard } from './components/StatusCard';
import { StepCard } from './components/StepCard';

const stylePresets = [
  { id: 'Vogue', label: 'Vogue Glow', description: 'Editorial skin + soft dodge', accent: 'from-pink-500 to-rose-500' },
  { id: 'Cyberpunk', label: 'Neon Pulse', description: 'Vivid cyan + magenta', accent: 'from-cyan-500 to-purple-500' },
  { id: 'Cartoon', label: 'Toon Pop', description: 'Bold outlines & matte skin', accent: 'from-yellow-400 to-orange-500' },
  { id: 'Cinematic', label: 'Cinematic', description: 'Warm shadows, teal highs', accent: 'from-amber-500 to-emerald-500' },
] as const;

const templatePresets = [
  { id: 'classic-4x6' as TemplateId, label: 'Full 4×6', description: 'Hero portrait with brand footer', format: '4x6' },
  { id: 'dual-strip-2x6' as TemplateId, label: 'Dual strip', description: 'Six frames, perforated share', format: '2x6' },
  { id: 'collage-4x6' as TemplateId, label: 'Collage', description: 'Story board layout', format: '4x6' },
] as const;

const journeySteps: StepDescriptor[] = [
  { title: 'Attract loop', subtitle: 'Mirror plays branded motion + QR gallery teaser' },
  { title: 'Style select', subtitle: 'Guest taps template + AI mood', cta: 'Choose style' },
  { title: 'Countdown & capture', subtitle: 'Mirror voice + LED ring sync', cta: 'Start timer' },
  { title: 'Magic render', subtitle: 'AI + template compositor show progress' },
  { title: 'Print & share', subtitle: 'HiTi print + instant QR download', cta: 'Print now' },
];

type LiveFeedStatus = 'connecting' | 'connected' | 'disconnected';

const getWsUrl = () => {
  const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';
  const configured = import.meta.env.VITE_WS_URL;
  const base = configured ?? apiUrl.replace(/^http/, 'ws');
  return `${base.replace(/\/$/, '')}/live`;
};

const useLiveFeed = (wsUrl: string) => {
  const [frame, setFrame] = useState<string | null>(null);
  const [status, setStatus] = useState<LiveFeedStatus>('connecting');

  useEffect(() => {
    let socket: WebSocket | undefined;
    let reconnectTimer: number | undefined;
    let currentUrl: string | undefined;
    let cancelled = false;

    const connect = () => {
      if (cancelled) return;
      setStatus('connecting');
      socket = new WebSocket(wsUrl);
      socket.binaryType = 'arraybuffer';
      socket.onopen = () => setStatus('connected');
      socket.onmessage = (event) => {
        if (cancelled) return;
        if (currentUrl) {
          URL.revokeObjectURL(currentUrl);
        }
        const blob = new Blob([event.data], { type: 'image/jpeg' });
        currentUrl = URL.createObjectURL(blob);
        setFrame(currentUrl);
      };
      socket.onclose = () => {
        setStatus('disconnected');
        if (!cancelled) {
          reconnectTimer = window.setTimeout(connect, 2000);
        }
      };
      socket.onerror = () => socket?.close();
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl);
      }
    };
  }, [wsUrl]);

  return { frame, status };
};

export default function App() {
  const [boothStatus, setBoothStatus] = useState<BoothStatus | null>(null);
  const [cameraStatus, setCameraStatus] = useState<CameraStatus | null>(null);
  const [capture, setCapture] = useState<CaptureResponse | null>(null);
  const [aiResult, setAiResult] = useState<AiResult | null>(null);
  const [templateResult, setTemplateResult] = useState<TemplateResponse | null>(null);
  const [printStatus, setPrintStatus] = useState<string>('Idle');
  const [snapshotFrame, setSnapshotFrame] = useState<string | null>(null);
  const [selectedStyle, setSelectedStyle] = useState<(typeof stylePresets)[number]>(stylePresets[0]);
  const [selectedTemplate, setSelectedTemplate] = useState<(typeof templatePresets)[number]>(templatePresets[0]);
  const [statusMessage, setStatusMessage] = useState('Ready to capture');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [timerSeconds, setTimerSeconds] = useState(3);
  const [intensity, setIntensity] = useState(0.7);
  const [customPrompt, setCustomPrompt] = useState('');
  const [printerName, setPrinterName] = useState('');
  const [copies, setCopies] = useState(1);
  const [cameraSettings, setCameraSettings] = useState<CameraSettingsPayload>({
    iso: 200,
    shutter: '1/125',
    aperture: 'f/5.6',
    whiteBalance: 'Auto',
    exposureComp: 0,
    flash: false,
  });
  const [isBusy, setIsBusy] = useState(false);
  const session = useSessionStore((state) => state.session);
  const sessionLoading = useSessionStore((state) => state.loading);
  const fetchSession = useSessionStore((state) => state.fetchSession);
  const wsUrl = getWsUrl();
  const { frame: liveFrame, status: liveFeedStatus } = useLiveFeed(wsUrl);
  const printPollRef = useRef<number | null>(null);
  const updateCameraSetting = (key: keyof CameraSettingsPayload, value: string | number | boolean) => {
    setCameraSettings((prev) => ({ ...prev, [key]: value }));
  };
  const adjustableKeys: Array<keyof Pick<CameraSettingsPayload, 'iso' | 'shutter' | 'aperture' | 'whiteBalance'>> = [
    'iso',
    'shutter',
    'aperture',
    'whiteBalance',
  ];

  useEffect(() => {
    fetchSession().catch((err) => console.error(err));
  }, [fetchSession]);

  useEffect(() => {
    let active = true;
    const loadStatus = async () => {
      try {
        const status = await Api.getStatus();
        if (!active) return;
        setBoothStatus(status);
        setCameraStatus(status.camera);
      } catch (error) {
        console.error(error);
      }
    };
    loadStatus();
    const interval = window.setInterval(loadStatus, 5000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (liveFeedStatus === 'connected') {
      setSnapshotFrame(null);
      return undefined;
    }
    const interval = window.setInterval(() => {
      Api.getLiveFrame()
        .then((response) => setSnapshotFrame(response.frame))
        .catch(() => {
          /** swallow */
        });
    }, 4000);
    return () => window.clearInterval(interval);
  }, [liveFeedStatus]);

  useEffect(() => {
    return () => {
      if (printPollRef.current) {
        window.clearInterval(printPollRef.current);
      }
    };
  }, []);

  const previewSource = liveFrame ?? snapshotFrame ?? aiResult?.previews?.[0] ?? capture?.previewData ?? null;

  const handleCapture = async () => {
    setIsBusy(true);
    setStatusMessage('Capturing frame…');
    try {
      const data = await Api.capture({ resumeLive: true });
      setCapture(data);
      setAiResult(null);
      setTemplateResult(null);
      setPrintStatus('Capture ready');
      setStatusMessage('Capture stored, pick a style');
    } catch (error) {
      console.error(error);
      setStatusMessage('Capture failed – check camera connection.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleTimer = () => {
    if (countdown) return;
    if (timerSeconds < 1) {
      handleCapture().catch(() => undefined);
      return;
    }
    let current = timerSeconds;
    setCountdown(current);
    const interval = window.setInterval(() => {
      current -= 1;
      if (current <= 0) {
        window.clearInterval(interval);
        setCountdown(null);
        handleCapture().catch(() => undefined);
      } else {
        setCountdown(current);
      }
    }, 1000);
  };

  const handleGenerateAI = async () => {
    if (!capture) {
      setStatusMessage('Capture a photo first.');
      return;
    }
    setIsBusy(true);
    setStatusMessage(`Generating ${selectedStyle.label} finish…`);
    try {
      const result = await Api.generateAI({
        sourcePath: capture.filePath,
        style: selectedStyle.id,
        intensity,
        prompt: customPrompt || undefined,
        variations: 1,
      });
      setAiResult(result);
      setStatusMessage('AI render ready. Compose template next.');
    } catch (error) {
      console.error(error);
      setStatusMessage('AI service failed.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleRenderTemplate = async () => {
    if (!capture && !aiResult) {
      setStatusMessage('Need at least one source to compose.');
      return;
    }
    setIsBusy(true);
    setStatusMessage('Compositing template…');
    try {
      const result = await Api.renderTemplate({
        templateId: selectedTemplate.id,
        images: aiResult?.outputs?.length ? aiResult.outputs : [capture!.filePath],
        caption: session?.name,
        qrData: session?.galleryEnabled ? `https://looqa.events/${session.id}` : undefined,
        accentColor: selectedStyle.id === 'Cyberpunk' ? '#0ff' : '#fff',
      });
      setTemplateResult(result);
      setStatusMessage('Template ready. Send to printer or save.');
    } catch (error) {
      console.error(error);
      setStatusMessage('Template renderer failed.');
    } finally {
      setIsBusy(false);
    }
  };

  const handlePrint = async () => {
    if (!templateResult) {
      setStatusMessage('Render a template first.');
      return;
    }
    setPrintStatus('Submitting to printer…');
    try {
      const { id } = await Api.submitPrint({
        filePath: templateResult.composedPath,
        format: templateResult.format,
        printer: printerName || undefined,
        copies,
      });
      pollPrint(id);
      setStatusMessage('Print job queued.');
    } catch (error) {
      console.error(error);
      setPrintStatus('Printer offline');
    }
  };

  const pollPrint = (id: string) => {
    if (printPollRef.current) {
      window.clearInterval(printPollRef.current);
    }
    const run = async () => {
      try {
        const status = await Api.getPrintStatus(id);
        setPrintStatus(status.status);
        if (status.status === 'completed' || status.status === 'error') {
          if (printPollRef.current) window.clearInterval(printPollRef.current);
        }
      } catch (error) {
        console.error(error);
        setPrintStatus('Printer unreachable');
        if (printPollRef.current) window.clearInterval(printPollRef.current);
      }
    };
    run();
    printPollRef.current = window.setInterval(run, 2000);
  };

  const handleSave = () => {
    if (!templateResult?.previewData) {
      setStatusMessage('Nothing to save.');
      return;
    }
    const link = document.createElement('a');
    link.href = templateResult.previewData;
    link.download = `looqa-${Date.now()}.jpg`;
    link.click();
    setStatusMessage('Image saved locally.');
  };

  const handleApplySettings = async () => {
    setStatusMessage('Updating camera settings…');
    try {
      await Api.updateCameraSettings(cameraSettings);
      setStatusMessage('Camera updated');
    } catch (error) {
      console.error(error);
      setStatusMessage('Unable to push settings.');
    }
  };

  const handleRetake = () => {
    setCapture(null);
    setAiResult(null);
    setTemplateResult(null);
    setPrintStatus('Retake queued');
    setStatusMessage('Ready for another capture');
  };

  return (
    <div className="min-h-screen p-8 text-white space-y-10">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-white/60">Mirror booth orchestration</p>
          <h1 className="text-4xl font-extrabold mt-1">LOOQA Mirror Control</h1>
        </div>
        <div className="text-right">
          <p className="text-sm text-white/60">Canon EOS 2000D · HiTi P525L</p>
          <p className="text-xl font-semibold text-brand">Windows 11 · Touch mirror</p>
        </div>
      </header>

      <section className="grid gap-6 md:grid-cols-4">
        <StatusCard
          title="Camera"
          value={
            cameraStatus
              ? `${cameraStatus.connected ? 'Online' : 'Offline'} · ${cameraStatus.driver}`
              : 'Loading…'
          }
          hint={liveFeedStatus === 'connected' ? 'Streaming LiveView' : 'Awaiting stream'}
        />
        <StatusCard
          title="Session"
          value={session ? session.name : 'No active session'}
          hint={session ? `${session.theme} · ${session.date}` : sessionLoading ? 'Syncing…' : 'Launch admin to start'}
        />
        <StatusCard
          title="Printer queue"
          value={
            boothStatus
              ? `${boothStatus.printer.printing} printing / ${boothStatus.printer.queued} queued`
              : 'Checking…'
          }
          hint={`Jobs total ${boothStatus?.printer.totalJobs ?? 0}`}
        />
        <StatusCard
          title="AI Engine"
          value={
            boothStatus ? `${boothStatus.ai.provider} · ${boothStatus.ai.pending} pending` : 'Ready'
          }
          hint={`Style ${selectedStyle.label}`}
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-[2fr,1fr]">
        <div className="rounded-3xl border border-white/10 p-6 bg-white/5">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold">Live preview</h2>
            <span className="text-sm text-white/60">{statusMessage}</span>
          </div>
          <div className="mt-4 aspect-video rounded-2xl bg-black/60 flex items-center justify-center overflow-hidden">
            {previewSource ? (
              <img src={previewSource} alt="Live view" className="h-full w-full object-cover" />
            ) : (
              <span className="text-white/50 text-lg">Waiting for camera feed…</span>
            )}
          </div>
          {countdown && (
            <div className="mt-4 text-center text-5xl font-bold text-brand animate-pulse">
              {countdown}
            </div>
          )}
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <button
              className="rounded-full bg-brand text-black font-semibold py-3 disabled:opacity-50"
              onClick={handleTimer}
              disabled={isBusy}
            >
              {countdown ? 'Counting…' : 'Start timer'}
            </button>
            <button
              className="rounded-full border border-white/30 py-3 font-semibold disabled:opacity-40"
              onClick={handleCapture}
              disabled={isBusy}
            >
              Capture now
            </button>
            <button
              className="rounded-full border border-white/30 py-3 font-semibold disabled:opacity-40"
              onClick={handleRetake}
              disabled={isBusy}
            >
              Retake
            </button>
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 p-6 bg-white/5 space-y-6">
          <div>
            <h3 className="text-lg font-semibold">Timer & status</h3>
            <div className="flex items-center gap-3 mt-3">
              <label htmlFor="timer" className="text-sm text-white/60">
                Seconds
              </label>
              <input
                id="timer"
                type="number"
                className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2"
                min={1}
                max={10}
                value={timerSeconds}
                onChange={(event) => setTimerSeconds(Number(event.target.value))}
              />
            </div>
            <p className="text-sm text-white/60 mt-2">LiveView: {liveFeedStatus}</p>
          </div>

          <div>
            <h3 className="text-lg font-semibold">Camera settings</h3>
            <div className="grid grid-cols-2 gap-3 mt-3">
              {adjustableKeys.map((key) => (
                <input
                  key={key}
                  value={(cameraSettings[key] ?? '') as string | number}
                  onChange={(event) =>
                    updateCameraSetting(
                      key,
                      key === 'iso' ? Number(event.target.value) : event.target.value
                    )
                  }
                  className="rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm"
                  placeholder={key}
                />
              ))}
            </div>
            <div className="mt-3 flex items-center gap-3">
              <label className="text-sm text-white/70 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={cameraSettings.flash ?? false}
                  onChange={(event) => updateCameraSetting('flash', event.target.checked)}
                />
                Flash
              </label>
              <input
                type="number"
                step="0.3"
                min={-3}
                max={3}
                value={cameraSettings.exposureComp ?? 0}
                onChange={(event) => updateCameraSetting('exposureComp', Number(event.target.value))}
                className="rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm flex-1"
                placeholder="Exposure"
              />
            </div>
            <button
              className="mt-3 px-3 py-2 rounded-full border border-white/30 text-sm"
              onClick={handleApplySettings}
            >
              Push to camera
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-white/10 p-6 bg-white/5">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-semibold">AI styles</h3>
            <div className="flex items-center gap-2 text-sm">
              <span>Intensity</span>
              <input
                type="range"
                min={0.2}
                max={1}
                step={0.05}
                value={intensity}
                onChange={(event) => setIntensity(Number(event.target.value))}
              />
              <span>{Math.round(intensity * 100)}%</span>
            </div>
          </div>
          <textarea
            value={customPrompt}
            onChange={(event) => setCustomPrompt(event.target.value)}
            placeholder="Optional freestyle prompt"
            className="mt-4 w-full rounded-2xl bg-black/30 border border-white/10 px-4 py-3 text-sm"
            rows={2}
          />
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {stylePresets.map((preset) => (
              <button
                key={preset.id}
                onClick={() => setSelectedStyle(preset)}
                className={clsx(
                  'rounded-2xl p-4 text-left border transition focus:outline-none',
                  preset.id === selectedStyle.id
                    ? 'border-brand bg-brand/20'
                    : 'border-white/10 hover:border-white/40'
                )}
              >
                <p className="text-sm uppercase text-white/60">{preset.id}</p>
                <p className="text-xl font-semibold">{preset.label}</p>
                <p className="text-sm text-white/60">{preset.description}</p>
              </button>
            ))}
          </div>
          <div className="mt-4 flex gap-3">
            <button
              className="rounded-full bg-brand text-black font-semibold px-6 py-3 disabled:opacity-50"
              onClick={handleGenerateAI}
              disabled={!capture || isBusy}
            >
              Generate style
            </button>
            {aiResult && (
              <span className="text-sm text-white/60 self-center">
                {aiResult.style} · {new Date(aiResult.completedAt).toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 p-6 bg-white/5">
          <h3 className="text-xl font-semibold">Templates</h3>
          <div className="mt-4 grid gap-3">
            {templatePresets.map((preset) => (
              <button
                key={preset.id}
                onClick={() => setSelectedTemplate(preset)}
                className={clsx(
                  'rounded-2xl border p-4 text-left transition',
                  preset.id === selectedTemplate.id
                    ? 'border-brand bg-white/10'
                    : 'border-white/10 hover:border-white/40'
                )}
              >
                <p className="text-sm uppercase text-white/60">{preset.format}</p>
                <p className="text-xl font-semibold">{preset.label}</p>
                <p className="text-sm text-white/60">{preset.description}</p>
              </button>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <input
              value={printerName}
              onChange={(event) => setPrinterName(event.target.value)}
              placeholder="Printer name (optional)"
              className="rounded-xl bg-black/30 border border-white/10 px-3 py-2"
            />
            <input
              type="number"
              min={1}
              max={4}
              value={copies}
              onChange={(event) => setCopies(Math.max(1, Number(event.target.value)))}
              className="rounded-xl bg-black/30 border border-white/10 px-3 py-2"
              placeholder="Copies"
            />
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              className="rounded-full border border-white/30 px-5 py-2 text-sm"
              onClick={handleRenderTemplate}
              disabled={isBusy}
            >
              Render template
            </button>
            <button className="rounded-full border border-white/30 px-5 py-2 text-sm" onClick={handleSave}>
              Save to disk
            </button>
            <button className="rounded-full bg-brand text-black px-5 py-2 text-sm" onClick={handlePrint}>
              Print
            </button>
            <span className="text-sm text-white/60 self-center">{printStatus}</span>
          </div>
        </div>
      </section>

      {templateResult && (
        <section className="rounded-3xl border border-white/10 p-6 bg-white/5">
          <h3 className="text-xl font-semibold">Template preview</h3>
          <img
            src={templateResult.previewData}
            alt="Template result"
            className="mt-4 rounded-2xl border border-white/10 max-w-full"
          />
        </section>
      )}

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold">Guest journey</h2>
          <span className="text-sm uppercase tracking-[0.3em] text-white/60">Mirror UI</span>
        </div>
        <div className="mt-6 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {journeySteps.map((step, index) => (
            <StepCard step={step} index={index} key={step.title} />
          ))}
        </div>
      </section>
    </div>
  );
}
