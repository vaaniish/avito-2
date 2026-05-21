#!/usr/bin/env swift

import Foundation
import ApplicationServices

func asBoolean(_ value: Bool) -> boolean_t {
    value ? 1 : 0
}

struct Command: Decodable {
    let cmd: String
    let value: Bool?
    let fromX: Double?
    let fromY: Double?
    let toX: Double?
    let toY: Double?
    let x: Double?
    let y: Double?
    let steps: Int?
    let delayMs: Int?
    let count: Int?
    let text: String?
    let key: String?
    let modifiers: [String]?
}

func reply(ok: Bool, error: String? = nil) {
    var payload: [String: Any] = ["ok": ok]
    if let error {
        payload["error"] = error
    }
    let data = try! JSONSerialization.data(withJSONObject: payload, options: [])
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write("\n".data(using: .utf8)!)
}

func easeInOut(_ progress: Double) -> Double {
    progress * progress * (3.0 - 2.0 * progress)
}

func moveMouse(from: CGPoint, to: CGPoint, steps: Int, delayMs: Int) {
    let safeSteps = max(1, steps)
    for index in 1...safeSteps {
        let progress = easeInOut(Double(index) / Double(safeSteps))
        let nextX = from.x + (to.x - from.x) * progress
        let nextY = from.y + (to.y - from.y) * progress
        let point = CGPoint(x: nextX, y: nextY)
        CGWarpMouseCursorPosition(point)
        if let event = CGEvent(
            mouseEventSource: nil,
            mouseType: .mouseMoved,
            mouseCursorPosition: point,
            mouseButton: .left
        ) {
            event.post(tap: .cghidEventTap)
        }
        usleep(useconds_t(max(1, delayMs) * 1000))
    }
}

func dragMouse(from: CGPoint, to: CGPoint, steps: Int, delayMs: Int, modifiers: [String]) {
    let flags = eventFlags(from: modifiers)
    let safeSteps = max(1, steps)

    guard let down = CGEvent(
        mouseEventSource: nil,
        mouseType: .leftMouseDown,
        mouseCursorPosition: from,
        mouseButton: .left
    ) else {
        return
    }

    down.flags = flags
    down.post(tap: .cghidEventTap)
    usleep(useconds_t(max(1, delayMs) * 1000))

    for index in 1...safeSteps {
        let progress = easeInOut(Double(index) / Double(safeSteps))
        let nextX = from.x + (to.x - from.x) * progress
        let nextY = from.y + (to.y - from.y) * progress
        let point = CGPoint(x: nextX, y: nextY)
        CGWarpMouseCursorPosition(point)
        if let drag = CGEvent(
            mouseEventSource: nil,
            mouseType: .leftMouseDragged,
            mouseCursorPosition: point,
            mouseButton: .left
        ) {
            drag.flags = flags
            drag.post(tap: .cghidEventTap)
        }
        usleep(useconds_t(max(1, delayMs) * 1000))
    }

    if let up = CGEvent(
        mouseEventSource: nil,
        mouseType: .leftMouseUp,
        mouseCursorPosition: to,
        mouseButton: .left
    ) {
        up.flags = flags
        up.post(tap: .cghidEventTap)
    }
    usleep(useconds_t(max(1, delayMs) * 1000))
}

func eventFlags(from modifiers: [String]) -> CGEventFlags {
    var flags: CGEventFlags = []
    for modifier in modifiers {
        switch modifier.lowercased() {
        case "shift":
            flags.insert(.maskShift)
        case "command", "cmd":
            flags.insert(.maskCommand)
        case "option", "alt":
            flags.insert(.maskAlternate)
        case "control", "ctrl":
            flags.insert(.maskControl)
        default:
            continue
        }
    }
    return flags
}

func keyCode(for key: String) -> CGKeyCode? {
    switch key.lowercased() {
    case "a": return 0
    case "g": return 5
    case "l": return 37
    case "f": return 3
    case "return", "enter": return 36
    case "tab": return 48
    case "space": return 49
    case "delete", "backspace": return 51
    case "escape", "esc": return 53
    case "down": return 125
    case "up": return 126
    default: return nil
    }
}

func clickMouse(at point: CGPoint, count: Int, delayMs: Int, modifiers: [String]) {
    let flags = eventFlags(from: modifiers)
    let safeCount = max(1, count)
    for index in 1...safeCount {
        guard
            let down = CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown, mouseCursorPosition: point, mouseButton: .left),
            let up = CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp, mouseCursorPosition: point, mouseButton: .left)
        else {
            continue
        }
        down.flags = flags
        up.flags = flags
        down.setIntegerValueField(.mouseEventClickState, value: Int64(index))
        up.setIntegerValueField(.mouseEventClickState, value: Int64(index))
        down.post(tap: .cghidEventTap)
        usleep(useconds_t(max(1, delayMs) * 1000))
        up.post(tap: .cghidEventTap)
        usleep(useconds_t(max(1, delayMs) * 1000))
    }
}

func pressKey(_ key: String, modifiers: [String], delayMs: Int) throws {
    guard let keyCode = keyCode(for: key) else {
        throw NSError(domain: "NativeMouse", code: 2, userInfo: [NSLocalizedDescriptionKey: "Unknown key: \(key)"])
    }
    let flags = eventFlags(from: modifiers)
    guard
        let down = CGEvent(keyboardEventSource: nil, virtualKey: keyCode, keyDown: true),
        let up = CGEvent(keyboardEventSource: nil, virtualKey: keyCode, keyDown: false)
    else {
        throw NSError(domain: "NativeMouse", code: 3, userInfo: [NSLocalizedDescriptionKey: "Unable to create keyboard event"])
    }
    down.flags = flags
    up.flags = flags
    down.post(tap: .cghidEventTap)
    usleep(useconds_t(max(1, delayMs) * 1000))
    up.post(tap: .cghidEventTap)
    usleep(useconds_t(max(1, delayMs) * 1000))
}

func typeText(_ text: String, delayMs: Int) {
    for scalar in text.unicodeScalars {
        let value = UInt16(scalar.value)
        var chars = [UniChar(value)]
        if let down = CGEvent(keyboardEventSource: nil, virtualKey: 0, keyDown: true),
           let up = CGEvent(keyboardEventSource: nil, virtualKey: 0, keyDown: false) {
            down.keyboardSetUnicodeString(stringLength: 1, unicodeString: &chars)
            up.keyboardSetUnicodeString(stringLength: 1, unicodeString: &chars)
            down.post(tap: .cghidEventTap)
            usleep(useconds_t(max(1, delayMs) * 1000))
            up.post(tap: .cghidEventTap)
            usleep(useconds_t(max(1, delayMs) * 1000))
        }
    }
}

defer {
    CGAssociateMouseAndMouseCursorPosition(asBoolean(true))
}

while let line = readLine() {
    if line.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
        continue
    }

    do {
        let data = Data(line.utf8)
        let command = try JSONDecoder().decode(Command.self, from: data)

        switch command.cmd {
        case "ping":
            reply(ok: true)
        case "associate":
            CGAssociateMouseAndMouseCursorPosition(asBoolean(command.value ?? true))
            reply(ok: true)
        case "move":
            guard
                let fromX = command.fromX,
                let fromY = command.fromY,
                let toX = command.toX,
                let toY = command.toY
            else {
                reply(ok: false, error: "Invalid move payload")
                continue
            }
            moveMouse(
                from: CGPoint(x: fromX, y: fromY),
                to: CGPoint(x: toX, y: toY),
                steps: command.steps ?? 24,
                delayMs: command.delayMs ?? 16
            )
            reply(ok: true)
        case "drag":
            guard
                let fromX = command.fromX,
                let fromY = command.fromY,
                let toX = command.toX,
                let toY = command.toY
            else {
                reply(ok: false, error: "Invalid drag payload")
                continue
            }
            dragMouse(
                from: CGPoint(x: fromX, y: fromY),
                to: CGPoint(x: toX, y: toY),
                steps: command.steps ?? 28,
                delayMs: command.delayMs ?? 18,
                modifiers: command.modifiers ?? []
            )
            reply(ok: true)
        case "click":
            guard let x = command.x, let y = command.y else {
                reply(ok: false, error: "Invalid click payload")
                continue
            }
            clickMouse(
                at: CGPoint(x: x, y: y),
                count: command.count ?? 1,
                delayMs: command.delayMs ?? 50,
                modifiers: command.modifiers ?? []
            )
            reply(ok: true)
        case "press":
            guard let key = command.key else {
                reply(ok: false, error: "Invalid press payload")
                continue
            }
            try pressKey(key, modifiers: command.modifiers ?? [], delayMs: command.delayMs ?? 50)
            reply(ok: true)
        case "type":
            guard let text = command.text else {
                reply(ok: false, error: "Invalid type payload")
                continue
            }
            typeText(text, delayMs: command.delayMs ?? 35)
            reply(ok: true)
        case "exit":
            reply(ok: true)
            exit(0)
        default:
            reply(ok: false, error: "Unknown command: \(command.cmd)")
        }
    } catch {
        reply(ok: false, error: error.localizedDescription)
    }
}
