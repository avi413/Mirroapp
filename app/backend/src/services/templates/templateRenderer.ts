import { randomUUID } from 'crypto';
import { access } from 'fs/promises';
import path from 'path';
import sharp, { OverlayOptions } from 'sharp';
import QRCode from 'qrcode';

import { logger } from '../../logger';

export type TemplateFormat = '4x6' | '2x6';

interface TemplateSlot {
  x: number;
  y: number;
  width: number;
  height: number;
  radius?: number;
}

interface TemplateLayout {
  id: string;
  format: TemplateFormat;
  size: { width: number; height: number };
  background?: string;
  overlay?: string;
  slots: TemplateSlot[];
}

const TEMPLATE_LIBRARY: Record<string, TemplateLayout> = {
  'classic-4x6': {
    id: 'classic-4x6',
    format: '4x6',
    size: { width: 1800, height: 1200 },
    background: 'classic-4x6-bg.png',
    overlay: 'classic-4x6-overlay.png',
    slots: [
      { x: 150, y: 150, width: 1500, height: 900, radius: 40 },
    ],
  },
  'dual-strip-2x6': {
    id: 'dual-strip-2x6',
    format: '2x6',
    size: { width: 1200, height: 1800 },
    background: 'dual-strip-bg.png',
    overlay: 'dual-strip-overlay.png',
    slots: [
      { x: 80, y: 120, width: 460, height: 560, radius: 30 },
      { x: 80, y: 700, width: 460, height: 560, radius: 30 },
      { x: 80, y: 1280, width: 460, height: 560, radius: 30 },
      { x: 660, y: 120, width: 460, height: 560, radius: 30 },
      { x: 660, y: 700, width: 460, height: 560, radius: 30 },
      { x: 660, y: 1280, width: 460, height: 560, radius: 30 },
    ],
  },
  'collage-4x6': {
    id: 'collage-4x6',
    format: '4x6',
    size: { width: 1800, height: 1200 },
    background: 'collage-bg.png',
    overlay: 'collage-overlay.png',
    slots: [
      { x: 80, y: 150, width: 740, height: 900, radius: 35 },
      { x: 980, y: 150, width: 740, height: 430, radius: 35 },
      { x: 980, y: 620, width: 740, height: 430, radius: 35 },
    ],
  },
};

export interface TemplateRequest {
  templateId: keyof typeof TEMPLATE_LIBRARY;
  images: string[];
  qrData?: string;
  caption?: string;
  accentColor?: string;
}

export interface TemplateResult {
  composedPath: string;
  previewData: string;
  format: TemplateFormat;
}

interface TemplateRendererOptions {
  templatesDir: string;
  processedDir: string;
}

export class TemplateRenderer {
  constructor(private readonly options: TemplateRendererOptions) {}

  async render(request: TemplateRequest): Promise<TemplateResult> {
    const layout = TEMPLATE_LIBRARY[request.templateId];
    if (!layout) {
      throw new Error(`Unknown template: ${request.templateId}`);
    }
    if (!request.images?.length) {
      throw new Error('Template render requires at least one source image');
    }

    const base = await this.buildBase(layout, request.accentColor);
    const composites: OverlayOptions[] = [];

    for (let i = 0; i < layout.slots.length; i += 1) {
      const sourcePath = request.images[i] ?? request.images[request.images.length - 1];
      if (!sourcePath) continue;
      const slot = layout.slots[i];
      const slotBuffer = await this.renderSlot(sourcePath, slot);
      composites.push({ input: slotBuffer, left: slot.x, top: slot.y });
    }

    if (request.qrData) {
      const qr = await QRCode.toBuffer(request.qrData, { margin: 0, scale: 8, color: { dark: '#000', light: '#ffffff' } });
      composites.push({
        input: await sharp(qr).extend({ top: 10, bottom: 10, left: 10, right: 10, background: '#ffffffee' }).png().toBuffer(),
        left: layout.size.width - 260,
        top: layout.size.height - 260,
      });
    }

    if (request.caption) {
      const caption = this.buildCaption(request.caption);
      composites.push({ input: caption, left: 60, top: layout.size.height - 200 });
    }

    const overlayAsset = await this.loadAsset(layout.overlay);
    if (overlayAsset) {
      composites.push({ input: overlayAsset, left: 0, top: 0 });
    }

    const outputPath = path.join(
      this.options.processedDir,
      `${randomUUID()}-${request.templateId}-${layout.format}.jpg`
    );
    const composed = await base.composite(composites).jpeg({ quality: 95 }).toBuffer();
    await sharp(composed).toFile(outputPath);

    logger.info(`[Template] Rendered template ${request.templateId} -> ${outputPath}`);

    return {
      composedPath: outputPath,
      previewData: `data:image/jpeg;base64,${composed.toString('base64')}`,
      format: layout.format,
    };
  }

  private async buildBase(layout: TemplateLayout, accentColor?: string) {
    const asset = await this.loadAsset(layout.background);
    if (asset) {
      return sharp(asset).resize(layout.size.width, layout.size.height, { fit: 'cover' }).ensureAlpha();
    }
    return sharp({
      create: {
        width: layout.size.width,
        height: layout.size.height,
        channels: 4,
        background: accentColor ?? '#0e0e0e',
      },
    }).ensureAlpha();
  }

  private async renderSlot(sourcePath: string, slot: TemplateSlot) {
    const slotImage = sharp(sourcePath).resize(slot.width, slot.height, {
      fit: 'cover',
      position: 'centre',
    });
    if (slot.radius) {
      const mask = this.roundedMask(slot.width, slot.height, slot.radius);
      slotImage.composite([{ input: mask, blend: 'dest-in' }]);
    }
    return slotImage.png().toBuffer();
  }

  private roundedMask(width: number, height: number, radius: number) {
    const svg = `
      <svg width="${width}" height="${height}">
        <rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="#fff" />
      </svg>
    `;
    return Buffer.from(svg);
  }

  private buildCaption(caption: string) {
    const safe = caption.slice(0, 60);
    const svg = `
      <svg width="1200" height="140">
        <rect width="100%" height="100%" rx="30" ry="30" fill="rgba(0,0,0,0.35)" />
        <text x="50%" y="55%" font-size="56" fill="#ffffff" text-anchor="middle" font-family="Inter, sans-serif" font-weight="600">${safe}</text>
      </svg>
    `;
    return Buffer.from(svg);
  }

  private async loadAsset(assetName?: string) {
    if (!assetName) return undefined;
    const assetPath = path.join(this.options.templatesDir, assetName);
    try {
      await access(assetPath);
      return assetPath;
    } catch {
      logger.warn(`[Template] Missing asset ${assetPath}, skipping`);
      return undefined;
    }
  }
}
