import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import winston from 'winston';
import { CameraService } from '../../camera/cameraService';
import { AIProcessor } from '../../ai/processor';
import { TemplateRenderer } from '../../templates/render';
import { PrinterQueue } from '../../printer/hitiDriver';
import { SessionManager } from '../../sessions/sessionManager';
import { SettingsService } from './config';

const logger = winston.createLogger({
  transports: [new winston.transports.Console()],
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp(),
    winston.format.printf(
      ({ level, message, timestamp }) => `[${timestamp}] ${level}: ${message}`
    )
  ),
});

async function bootstrap() {
  const settings = await SettingsService.getInstance().load();
  const camera = new CameraService();
  const ai = new AIProcessor(settings.ai.maxParallelJobs);
  const templates = new TemplateRenderer();
  const printer = new PrinterQueue();
  const sessions = new SessionManager(settings.storage.eventsDir);

  await camera.initialize();

  const app = express();
  app.use(express.json());

  app.get('/health', (_, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
  });

  app.get('/camera/status', (_, res) => {
    res.json(camera.getStatus());
  });

  app.post('/camera/capture', async (_req, res) => {
    try {
      const capture = await camera.capture();
      res.json(capture);
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  app.post('/ai/process', async (req, res) => {
    try {
      const result = await ai.enqueue({
        capturePath: req.body.capturePath,
        prompt: req.body.prompt,
        style: req.body.style,
        intensity: req.body.intensity ?? 0.7,
        variations: req.body.variations ?? 3,
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  app.post('/template/render', async (req, res) => {
    try {
      const result = await templates.render(req.body);
      res.json(result);
    } catch (err) {
      res.status(500).json({ message: (err as Error).message });
    }
  });

  app.post('/print', (req, res) => {
    const id = printer.enqueue({
      filePath: req.body.filePath,
      format: req.body.format,
      copies: req.body.copies ?? settings.printing.defaultCopies,
    });
    res.json({ id });
  });

  app.get('/print/:id', (req, res) => {
    const status = printer.getStatus(req.params.id);
    if (!status) {
      return res.status(404).json({ message: 'Job not found' });
    }
    res.json({ status });
  });

  app.post('/session', async (req, res) => {
    const session = await sessions.start(req.body);
    res.json(session);
  });

  app.get('/session', (_req, res) => {
    res.json(sessions.getActive() ?? null);
  });

  const server = createServer(app);
  const wss = new WebSocketServer({ server, path: '/liveview' });

  wss.on('connection', async (socket) => {
    logger.info('LiveView client connected');
    const pushFrame = (frame: Buffer) => {
      socket.send(frame);
    };
    camera.registerLiveViewClient(pushFrame);
    if (!camera.getStatus().liveView) {
      await camera.startLiveView();
    }
    socket.on('close', async () => {
      logger.info('LiveView client disconnected');
      camera.unregisterLiveViewClient(pushFrame);
      if (wss.clients.size === 0) {
        await camera.stopLiveView();
      }
    });
  });

  const port = process.env.PORT ?? 4000;
  server.listen(port, () => {
    logger.info(`LOOQA backend ready on http://localhost:${port}`);
  });
}

bootstrap().catch((err) => {
  logger.error(err);
  process.exit(1);
});
