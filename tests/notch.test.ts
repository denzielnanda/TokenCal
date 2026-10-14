import { describe, expect, it } from 'vitest';
import { parseNativeDisplays, widgetGeometry } from '../electron/notch';
const external = {
  id: 2,
  bounds: { x: -1920, y: 0, width: 1920, height: 1080 },
  workArea: { x: -1920, y: 25, width: 1920, height: 1055 },
};
const mac = {
  id: 1,
  bounds: { x: 0, y: 0, width: 1710, height: 1107 },
  workArea: { x: 0, y: 33, width: 1710, height: 1074 },
};
const native = [{ id: 1, frame: mac.bounds, notch: { x: 763, y: 0, width: 185, height: 33 } }];
describe('MacBook notch placement', () => {
  it('chooses the notched MacBook even when an external monitor is primary', () => {
    const widget = widgetGeometry([external, mac], 2, native, 'auto');
    expect(widget.displayId).toBe(1);
    expect(widget.placement).toBe('notch');
    expect(widget.collapsed.x + widget.wingWidth).toBe(native[0].notch.x);
    expect(widget.cameraWidth).toBe(185);
    expect(widget.collapsed.y).toBe(0);
    expect(
      Math.abs(
        widget.expanded.x + (widget.expanded.width - widget.cameraWidth) / 2 - native[0].notch.x,
      ),
    ).toBeLessThanOrEqual(0.5);
    expect(widget.expanded.height).toBeLessThanOrEqual(mac.bounds.height);
  });
  it('uses the reserved work area for Windows, Intel Macs, and explicit top-edge mode', () => {
    const edge = widgetGeometry([external, mac], 2, native, 'edge');
    expect(edge.placement).toBe('edge');
    expect(edge.displayId).toBe(2);
    expect(edge.collapsed.y).toBe(25);
    expect(edge.hasNotch).toBe(true);
    expect(widgetGeometry([external], 2, [], 'notch').note).toContain('No visible MacBook cutout');
  });
  it('rejects malformed native data and ignores invalid rectangles', () => {
    expect(parseNativeDisplays(JSON.stringify(native))).toEqual(native);
    expect(parseNativeDisplays('[{"id":1,"frame":{"width":-1},"notch":null}]')).toEqual([]);
    expect(() => parseNativeDisplays('{}')).toThrow('Invalid display geometry');
  });
});
