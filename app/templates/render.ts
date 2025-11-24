export type TemplateFormat = '4x6' | '2x6';

export interface TemplateInput {
  baseImage: string;
  overlayAssets: string[];
  qrCode?: string;
  format: TemplateFormat;
  copies?: number;
}

export interface TemplateResult {
  composedPath: string;
}

export class TemplateRenderer {
  async render(input: TemplateInput): Promise<TemplateResult> {
    // TODO: implement via Sharp / Node-Canvas
    const composedPath = `${input.baseImage.replace('.jpg', '')}_${input.format}.jpg`;
    return { composedPath };
  }
}
