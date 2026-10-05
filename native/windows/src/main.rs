// تطبيق Uniteam لويندوز — غلاف مستقل يفتح الموقع المنشور في نافذة خاصة.
//
// الفكرة نفسها في الـ APK: الواجهة تُحمَّل من الشبكة فتصل تعديلاتها تلقائياً،
// والغلاف يضيف ما لا يستطيعه المتصفح: معرّف جهاز ثابت لا يتأثر بمسح البيانات.
//
// المعرّف مشتق من MachineGuid في سجل ويندوز (ثابت ما لم يُعَد تثبيت ويندوز)،
// ويُشفَّر بـ SHA-256 قبل إرساله فلا يغادر الرقم الأصلي الجهاز.
// يُحقن في الصفحة باسم window.UniteamDesktop، وتقرؤه utils.ts بصيغة win_.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use sha2::{Digest, Sha256};
use tauri::{WebviewUrl, WebviewWindowBuilder};

/// يُستبدل وقت البناء بمتغير UNITEAM_APP_URL من GitHub Actions
const DEFAULT_URL: &str = "https://rtmteam.github.io/Uniteam-v6/";

#[cfg(windows)]
fn machine_guid() -> Option<String> {
    use winreg::enums::{HKEY_LOCAL_MACHINE, KEY_READ, KEY_WOW64_64KEY};
    use winreg::RegKey;
    // KEY_WOW64_64KEY: نقرأ نسخة 64 بت من السجل دائماً، فيتطابق المعرّف أياً كانت معمارية البناء
    let key = RegKey::predef(HKEY_LOCAL_MACHINE)
        .open_subkey_with_flags("SOFTWARE\\Microsoft\\Cryptography", KEY_READ | KEY_WOW64_64KEY)
        .ok()?;
    let value: String = key.get_value("MachineGuid").ok()?;
    let value = value.trim().to_lowercase();
    if value.len() < 8 { None } else { Some(value) }
}

#[cfg(not(windows))]
fn machine_guid() -> Option<String> {
    None
}

/// win_ + أول 24 حرفاً من بصمة SHA-256. فارغ إن تعذّرت القراءة،
/// فتعود الواجهة تلقائياً إلى معرّف المتصفح hw_.
fn device_id() -> String {
    match machine_guid() {
        Some(guid) => {
            let mut hasher = Sha256::new();
            hasher.update(b"uniteam-desktop:");
            hasher.update(guid.as_bytes());
            let hex: String = hasher.finalize().iter().map(|b| format!("{:02x}", b)).collect();
            format!("win_{}", &hex[..24])
        }
        None => String::new(),
    }
}

fn main() {
    let app_url = option_env!("UNITEAM_APP_URL")
        .map(|s| s.trim())
        .filter(|s| s.starts_with("https://"))
        .unwrap_or(DEFAULT_URL);

    // يُحقن قبل أي كود في كل صفحة تُحمَّل (صفحة الاتصال المحلية والموقع نفسه)
    let script = format!(
        r#"(function () {{
  try {{
    var id = {id};
    Object.defineProperty(window, 'UniteamDesktop', {{
      value: Object.freeze({{
        platform: 'windows',
        appUrl: {url},
        getDeviceId: function () {{ return id; }}
      }}),
      writable: false,
      configurable: false
    }});
  }} catch (e) {{}}
}})();"#,
        id = serde_json::to_string(&device_id()).unwrap_or_else(|_| "\"\"".into()),
        url = serde_json::to_string(app_url).unwrap_or_else(|_| "\"\"".into())
    );

    tauri::Builder::default()
        .setup(move |app| {
            // تبدأ النافذة بصفحة محلية تتحقق من الاتصال ثم تنتقل إلى الموقع
            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("Uniteam")
                .inner_size(1280.0, 820.0)
                .min_inner_size(400.0, 600.0)
                .center()
                .initialization_script(script.as_str())
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("تعذّر تشغيل Uniteam");
}
