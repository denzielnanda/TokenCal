import type { WidgetGeometry, WidgetMode } from '../src/shared/types';

export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface ScreenGeometry {
  id: number;
  bounds: Rectangle;
  workArea: Rectangle;
}
export interface NativeDisplay {
  id: number;
  frame: Rectangle;
  notch: Rectangle | null;
}

export function parseNativeDisplays(raw: string): NativeDisplay[] {
  const data: unknown = JSON.parse(raw);
  if (!Array.isArray(data) || data.length > 32) throw new Error('Invalid display geometry.');
  const rectangle = (r: any): r is Rectangle =>
    r &&
    ['x', 'y', 'width', 'height'].every((k) => typeof r[k] === 'number' && Number.isFinite(r[k])) &&
    r.width > 0 &&
    r.height > 0;
  return data.filter(
    (d): d is NativeDisplay =>
      d && Number.isInteger(d.id) && rectangle(d.frame) && (d.notch === null || rectangle(d.notch)),
  );
}

export function widgetGeometry(
  displays: ScreenGeometry[],
  primaryId: number,
  native: NativeDisplay[],
  mode: WidgetMode,
): WidgetGeometry {
  const available = displays.map((d) => ({
    display: d,
    cutout: native.find((n) => n.id === d.id)?.notch ?? null,
  }));
  const target = mode !== 'edge' ? available.find((d) => d.cutout !== null) : undefined;
  const display = target?.display ?? displays.find((d) => d.id === primaryId) ?? displays[0];
  if (!display) throw new Error('No display available.');
  const cutout = target?.cutout;
  if (cutout) {
    const wing = 112;
    const width = cutout.width + wing * 2;
    const height = Math.max(32, cutout.height) + 8;
    const x = Math.round(cutout.x - wing),
      y = Math.round(display.bounds.y);
    return {
      placement: 'notch',
      displayId: display.id,
      hasNotch: true,
      cameraWidth: cutout.width,
      cameraHeight: cutout.height,
      wingWidth: wing,
      collapsed: { x, y, width: Math.round(width), height: Math.round(height) },
      expanded: {
        x: Math.round(cutout.x + cutout.width / 2 - 250),
        y,
        width: 500,
        height: Math.min(display.bounds.height, Math.round(height + 600)),
      },
      note: 'Fits around this MacBook’s camera cutout. Hover or click to expand.',
    };
  }
  const width = 360,
    height = 46;
  const x = Math.round(display.workArea.x + (display.workArea.width - width) / 2),
    y = display.workArea.y;
  return {
    placement: 'edge',
    displayId: display.id,
    hasNotch: available.some((d) => d.cutout !== null),
    cameraWidth: 0,
    cameraHeight: 0,
    wingWidth: 0,
    collapsed: { x, y, width, height },
    expanded: {
      x: Math.round(display.workArea.x + (display.workArea.width - 500) / 2),
      y,
      width: 500,
      height: Math.min(display.workArea.height, 646),
    },
    note:
      mode === 'notch'
        ? 'No visible MacBook cutout found. Using the top-edge panel.'
        : 'Top-edge panel on this display. Hover or click to expand.',
  };
}
