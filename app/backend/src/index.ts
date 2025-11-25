import cors from 'cors';
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { z } from 'zod';

import { SettingsService } from './config';
import { logger } from './logger';
import {
  CameraService,
  CameraSettings,
} from './services/camera/cameraService';
import { AIProcessor, StyleType } from './services/ai/processor';
import { TemplateRenderer } from './services/templates/templateRenderer';
import { PrinterQueue } from './services/printer/hitiDriver';
import { SessionManager } from './services/session/sessionManager';

const captureSchema = z.object({
  resumeLive: z.boolean().optional(),
});

const aiSchema = z
  .object({
    sourcePath: z.string().optional(),
    base64: z.string().optional(),
    prompt: z.string().max(200).optional(),
    style: z.enum([
      'Vogue',
      'Cartoon',
      'Cyberpunk',
      'Anime',
      'Pop Art',
      'Freestyle',
      'Studio',
      'Cinematic',
    ] as [StyleType, ...StyleType[]]).optional(),
    intensity: z.number().min(0).max(1).optional(),
    variations: z.number().int().min(1).max(4).optional(),
  })
  .refine((data) => data.sourcePath || data.base64, {
    message: 'Provide either sourcePath or base64 image',
  });

const templateSchema = z.object({
  templateId: z.string(),
  images: z.array(z.string()).nonempty(),
  qrData: z.string().optional(),
  caption: z.string().optional(),
  accentColor: z.string().optional(),
});

const printSchema = z.object({
  filePath: z.string(),
  format: z.enum(['4x6', '2x6']),
  copies: z.number().int().min(1).max(10).optional(),
  printer: z.string().optional(),
});

const cameraSettingsSchema = z.object({
  iso: z.number().int().min(100).max(25600).optional(),
  shutter: z.string().optional(),
  aperture: z.string().optional(),
  whiteBalance: z.string().optional(),
  exposureComp: z.number().min(-5).max(5).optional(),
  flash: z.boolean().optional(),
});

const sessionSchema = z.object({
  name: z.string(),
  date: z.string(),
  aiEnabled: z.boolean(),
  theme: z.string(),
  maxPhotos: z.number().int().min(1),
  framesPerTemplate: z.number().int().min(1),
  copies: z.number().int().min(1),
  galleryEnabled: z.boolean(),
  cloudBackup: z.boolean(),
});

async function bootstrap() {
  const settings = await SettingsService.getInstance().load();

  const camera = new CameraService({
    captureDir: settings.storage.captureDir,
    liveView: settings.liveView,
  });
  await camera.initialize();

  const ai = new AIProcessor({
    processedDir: settings.storage.processedDir,
    maxParallelJobs: settings.ai.maxParallelJobs,
    provider: settings.ai.provider,
    defaultStyle: settings.ai.defaultStyle as StyleType,
  });
  await ai.initialize();

  const templates = new TemplateRenderer({
    processedDir: settings.storage.processedDir,
    templatesDir: settings.storage.templatesDir,
  });

  const printer = new PrinterQueue({
    defaultCopies: settings.printing.defaultCopies,
    queueRetries: settings.printing.queueRetries,
    targetPrinters: settings.printing.targetPrinters ?? [],
  });

  const sessions = new SessionManager(settings.storage.eventsDir);

  const app = express();
  app.use(
    cors({
      origin: true,
      credentials: true,
    })
  );
  app.use(express.json({ limit: '30mb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
  });

  const api = express.Router();

  api.get('/status', async (_req, res) => {
    const cameraStatus = camera.getStatus();
    res.json({
      camera: cameraStatus,
      session: sessions.getActive() ?? null,
      printer: printer.getMetrics(),
      ai: {
        provider: settings.ai.provider,
        pending: ai.getPendingJobs(),
      },
    });
  });

  api.get('/camera/status', (_req, res) => {
    res.json(camera.getStatus());
  });

  api.post('/capture', async (req, res, next) => {
    try {
      captureSchema.parse(req.body ?? {});
      const capture = await camera.capture();
      if (req.body?.resumeLive) {
        await camera.startLiveView();
      }
      res.json(capture);
    } catch (error) {
      next(error);
    }
  });

  api.get('/live', async (_req, res) => {
    const frame = await camera.getLatestFrame();
    if (!frame) {
      return res.status(503).json({ message: 'LiveView not ready' });
    }
    res.json({ frame: `data:image/jpeg;base64,${frame.toString('base64')}` });
  });

  api.post('/camera/settings', async (req, res, next) => {
    try {
      const value = cameraSettingsSchema.parse(req.body ?? {});
      await camera.setSettings(value as CameraSettings);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  api.post('/ai/generate', async (req, res, next) => {
    try {
      const payload = aiSchema.parse(req.body ?? {});
      const result = await ai.enqueue(payload);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  api.post('/template', async (req, res, next) => {
    try {
      const payload = templateSchema.parse(req.body ?? {});
      const result = await templates.render(payload);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  api.post('/print', async (req, res, next) => {
    try {
      const payload = printSchema.parse(req.body ?? {});
      const id = printer.enqueue(payload);
      res.json({ id });
    } catch (error) {
      next(error);
    }
  });

  api.get('/print/:id', (req, res) => {
    const status = printer.getStatus(req.params.id);
    if (!status) {
      return res.status(404).json({ message: 'Job not found' });
    }
    res.json(status);
  });

  api.post('/session', async (req, res, next) => {
    try {
      const payload = sessionSchema.parse(req.body ?? {});
      const session = await sessions.start(payload);
      res.json(session);
    } catch (error) {
      next(error);
    }
  });

  api.get('/session', (_req, res) => {
    res.json(sessions.getActive() ?? null);
  });

  app.use('/api', api);

  app.use(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      logger.error(`[API] ${err.message}`);
      res.status(400).json({ message: err.message });
    }
  );

  const server = createServer(app);
  const wss = new WebSocketServer({ server, path: '/live' });

  wss.on('connection', async (socket) => {
    logger.info('LiveView client connected');
    const pushFrame = (frame: Buffer) => {
      if (socket.readyState === socket.OPEN) {
        socket.send(frame);
      }
    };
    camera.registerLiveViewClient(pushFrame);
    await camera.startLiveView();
    socket.once('close', async () => {
      logger.info('LiveView client disconnected');
      camera.unregisterLiveViewClient(pushFrame);
      if (wss.clients.size === 0) {
        await camera.stopLiveView();
      }
    });
  });

  const port = Number(process.env.PORT ?? 4000);
  server.listen(port, () => {
    logger.info(`Mirror backend listening on http://localhost:${port}`);
  });

  const gracefulShutdown = async () => {
    logger.info('Shutting down backend...');
    await camera.stopLiveView();
    await camera.dispose();
    server.close(() => process.exit(0));
  };

  process.on('SIGINT', gracefulShutdown);
  process.on('SIGTERM', gracefulShutdown);
}

bootstrap().catch((error) => {
  logger.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
