// TokenCal · read-only display geometry using public AppKit APIs.
import AppKit
import Foundation

struct Rect: Codable {
    let x: Double
    let y: Double
    let width: Double
    let height: Double
}
struct DisplayInfo: Codable {
    let id: UInt32
    let frame: Rect
    let notch: Rect?
}

_ = NSApplication.shared
let screens = NSScreen.screens
let referenceTop = screens.first?.frame.maxY ?? 0
func converted(_ r: NSRect) -> Rect {
    Rect(x: Double(r.minX), y: Double(referenceTop - r.maxY),
         width: Double(r.width), height: Double(r.height))
}
let displays: [DisplayInfo] = screens.map { screen in
    let id = (screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.uint32Value ?? 0
    let left = screen.auxiliaryTopLeftArea ?? .zero
    let right = screen.auxiliaryTopRightArea ?? .zero
    let height = screen.safeAreaInsets.top
    let width = right.minX - left.maxX
    let cutout: Rect? = height > 0 && left.width > 0 && right.width > 0 && width > 0
        ? converted(NSRect(x: left.maxX, y: screen.frame.maxY - height, width: width, height: height))
        : nil
    return DisplayInfo(id: id, frame: converted(screen.frame), notch: cutout)
}
if let data = try? JSONEncoder().encode(displays), let json = String(data: data, encoding: .utf8) {
    print(json)
}
