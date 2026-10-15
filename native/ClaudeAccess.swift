import Foundation
import Security

// This helper is called only by TokenCal. stdout is a private pipe to its main process,
// never a diagnostic log. It returns only Claude's login, not other Keychain entries.
func emit(_ value: [String: Any]) {
    if let data = try? JSONSerialization.data(withJSONObject: value) {
        FileHandle.standardOutput.write(data)
    }
}
let prompt = CommandLine.arguments.contains("--allow-prompt")
let query: [String: Any] = [
    kSecClass as String: kSecClassGenericPassword,
    kSecAttrService as String: "Claude Code-credentials",
    kSecAttrAccount as String: NSUserName(),
    kSecMatchLimit as String: kSecMatchLimitOne,
    kSecReturnData as String: true,
    kSecUseAuthenticationUI as String: prompt ? kSecUseAuthenticationUIAllow : kSecUseAuthenticationUIFail,
]
var result: CFTypeRef?
let status = SecItemCopyMatching(query as CFDictionary, &result)
if status == errSecItemNotFound {
    emit(["status": "missing"])
} else if status == errSecInteractionNotAllowed || status == errSecUserCanceled || status == errSecAuthFailed {
    emit(["status": "permission"])
} else if status != errSecSuccess {
    emit(["status": "unavailable"])
} else if let data = result as? Data, data.count <= 1_048_576,
          let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let login = json["claudeAiOauth"] as? [String: Any],
          let token = login["accessToken"] as? String {
    var safe: [String: Any] = ["claudeAiOauth": ["accessToken": token]]
    var fields: [String: Any] = ["accessToken": token]
    for key in ["expiresAt", "scopes", "subscriptionType"] {
        if let value = login[key] { fields[key] = value }
    }
    safe["claudeAiOauth"] = fields
    emit(safe)
} else {
    emit(["status": "invalid"])
}
