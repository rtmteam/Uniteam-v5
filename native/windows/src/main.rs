// تطبيق Uniteam لويندوز — غلاف مستقل يفتح الموقع المنشور في نافذة خاصة.
//
// الفكرة نفسها في الـ APK: الواجهة تُحمَّل من الشبكة فتصل تعديلاتها تلقائياً،
// والغلاف يضيف ما لا يستطيعه المتصفح: معرّف جهاز ثابت لا يتأثر بمسح البيانات.
//
// المعرّف مشتق من MachineGuid في سجل ويندوز (ثابت ما لم يُعَد تثبيت ويندوز)،
// ويُشفَّر بـ SHA-256 قبل إرساله فلا يغادر الرقم الأصلي الجهاز.
// يُحقن في الصفحة باسم window.UniteamDesktop، وتقرؤه utils.ts بصيغة win_.
//
// منذ 1.1.0:
// - يعمل بجانب الساعة: زر الإغلاق يخفي النافذة، و«خروج» من قائمة الأيقونة يُنهيه.
// - نسخة واحدة فقط: فتحه مرة ثانية يُظهر النافذة الموجودة.
// - التنزيلات تُحفظ في مجلد التنزيلات مع إشعار وفتح المجلد.
// - أمر notify يستدعيه الموقع لعرض إشعارات ويندوز (components/desktopNotify.ts).
// - تحديث تلقائي موقَّع من إصدار windows-updates على GitHub (انظر run_updater).

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use sha2::{Digest, Sha256};
use tauri::ipc::CapabilityBuilder;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::webview::DownloadEvent;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_updater::UpdaterExt;

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

/// إشعار ويندوز — يستدعيه الموقع عبر window.__TAURI__.core.invoke('notify')
#[tauri::command]
fn notify(app: AppHandle, title: String, body: String) -> Result<(), String> {
    let title: String = title.chars().take(120).collect();
    let body: String = body.chars().take(400).collect();
    app.notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .map_err(|e| e.to_string())
}

fn show_notification(app: &AppHandle, title: &str, body: &str) {
    let _ = app.notification().builder().title(title).body(body).show();
}

/// إظهار النافذة الرئيسية من الخلفية
fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

/// اسم غير مستعمل في المجلد: تقرير.xlsx ← تقرير (1).xlsx ← تقرير (2).xlsx …
fn unique_path(dir: &Path, file_name: &str) -> PathBuf {
    let first = dir.join(file_name);
    if !first.exists() {
        return first;
    }
    let p = Path::new(file_name);
    let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or("file");
    let ext = p.extension().and_then(|s| s.to_str()).map(|e| format!(".{}", e)).unwrap_or_default();
    for i in 1..1000 {
        let candidate = dir.join(format!("{} ({}){}", stem, i, ext));
        if !candidate.exists() {
            return candidate;
        }
    }
    first
}

/// يفتح مستكشف الملفات والملف محدَّد
fn reveal_in_explorer(path: &Path) {
    #[cfg(windows)]
    {
        let _ = std::process::Command::new("explorer")
            .arg(format!("/select,{}", path.display()))
            .spawn();
    }
    #[cfg(not(windows))]
    {
        let _ = path;
    }
}

static TRAY_HINT_SHOWN: AtomicBool = AtomicBool::new(false);

// ---------------- التحديث التلقائي ----------------
//
// يفحص بعد ٢٠ ثانية من التشغيل ثم كل ٦ ساعات. التحديث موقَّع بمفتاح المشروع،
// والأداة ترفض أي ملف لا يطابق المفتاح العام في tauri.conf.json.
// التثبيت لا يحدث والموظف يستخدم النافذة: ينتظر حتى تُخفى بجانب الساعة أو تُصغَّر.
// قبل التثبيت تُكتب علامة، فيبدأ التطبيق بعده مخفياً ويُظهر إشعار «تم التحديث».

const UPDATE_MARKER: &str = "update-installed.txt";
const FIRST_CHECK_DELAY: Duration = Duration::from_secs(20);
const CHECK_INTERVAL: Duration = Duration::from_secs(6 * 60 * 60);
const IDLE_POLL: Duration = Duration::from_secs(30);

fn marker_path(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_data_dir().ok().map(|d| d.join(UPDATE_MARKER))
}

/// النافذة مخفية أو مصغّرة — لا أحد يستخدم التطبيق الآن
fn window_idle(app: &AppHandle) -> bool {
    match app.get_webview_window("main") {
        Some(w) => !w.is_visible().unwrap_or(true) || w.is_minimized().unwrap_or(false),
        None => true,
    }
}

async fn check_and_install(app: &AppHandle) -> Result<(), String> {
    let updater = app.updater().map_err(|e| e.to_string())?;
    let update = match updater.check().await.map_err(|e| e.to_string())? {
        Some(u) => u,
        None => return Ok(()),
    };
    let version = update.version.clone();
    let bytes = update
        .download(|_, _| {}, || {})
        .await
        .map_err(|e| e.to_string())?;

    while !window_idle(app) {
        std::thread::sleep(IDLE_POLL);
    }

    if let Some(p) = marker_path(app) {
        if let Some(dir) = p.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        let _ = std::fs::write(&p, &version);
    }
    // على ويندوز يُغلق التطبيق هنا ويعمل المثبّت في وضع صامت مع شريط تقدّم صغير
    if let Err(e) = update.install(bytes) {
        if let Some(p) = marker_path(app) {
            let _ = std::fs::remove_file(p);
        }
        return Err(e.to_string());
    }
    app.restart();
}

fn run_updater(app: AppHandle) {
    std::thread::spawn(move || {
        std::thread::sleep(FIRST_CHECK_DELAY);
        loop {
            if let Err(e) = tauri::async_runtime::block_on(check_and_install(&app)) {
                eprintln!("update check failed: {}", e);
            }
            std::thread::sleep(CHECK_INTERVAL);
        }
    });
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
        version: {ver},
        appUrl: {url},
        getDeviceId: function () {{ return id; }}
      }}),
      writable: false,
      configurable: false
    }});
  }} catch (e) {{}}
}})();"#,
        id = serde_json::to_string(&device_id()).unwrap_or_else(|_| "\"\"".into()),
        ver = serde_json::to_string(env!("CARGO_PKG_VERSION")).unwrap_or_else(|_| "\"\"".into()),
        url = serde_json::to_string(app_url).unwrap_or_else(|_| "\"\"".into())
    );

    // موقعنا وحده مسموح له باستدعاء أمر notify — لا أي موقع آخر.
    // المطابقة على الأصل (https://النطاق/) لأن الطلب يحمل الأصل لا المسار الكامل.
    let origin = match app_url.find("://") {
        Some(i) => match app_url[i + 3..].find('/') {
            Some(j) => app_url[..i + 3 + j].to_string(),
            None => app_url.trim_end_matches('/').to_string(),
        },
        None => app_url.to_string(),
    };
    let remote_pattern = format!("{}/*", origin);

    tauri::Builder::default()
        // يجب أن تكون الأولى: تشغيل التطبيق مرة ثانية يُظهر النافذة الموجودة بدل نسخة جديدة
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main(app);
        }))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![notify])
        .setup(move |app| {
            app.add_capability(
                CapabilityBuilder::new("uniteam-site")
                    .remote(remote_pattern.clone())
                    .window("main")
                    .permission("allow-notify"),
            )?;

            // ---------- بعد تحديث تلقائي: يبدأ مخفياً بجانب الساعة كما كان ----------
            let mut start_hidden = false;
            if let Some(p) = marker_path(app.handle()) {
                if let Ok(v) = std::fs::read_to_string(&p) {
                    let _ = std::fs::remove_file(&p);
                    start_hidden = true;
                    show_notification(
                        app.handle(),
                        "تم تحديث Uniteam",
                        &format!("الإصدار {} يعمل الآن بجانب الساعة.", v.trim()),
                    );
                }
            }

            // ---------- الأيقونة بجانب الساعة ----------
            let open_item = MenuItem::with_id(app, "open", "فتح Uniteam", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "خروج", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open_item, &quit_item])?;
            let mut tray = TrayIconBuilder::with_id("uniteam-tray")
                .tooltip(format!("Uniteam {}", env!("CARGO_PKG_VERSION")))
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => show_main(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main(tray.app_handle());
                    }
                });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;

            // ---------- النافذة ----------
            let downloads_handle = app.handle().clone();
            // تبدأ النافذة بصفحة محلية تتحقق من الاتصال ثم تنتقل إلى الموقع
            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("Uniteam")
                .inner_size(1280.0, 820.0)
                .min_inner_size(400.0, 600.0)
                .center()
                .visible(!start_hidden)
                .initialization_script(script.as_str())
                .on_download(move |_webview, event| {
                    match event {
                        DownloadEvent::Requested { destination, .. } => {
                            // الحفظ في مجلد التنزيلات باسم غير مستعمل
                            let name = destination
                                .file_name()
                                .and_then(|n| n.to_str())
                                .filter(|n| !n.is_empty())
                                .unwrap_or("Uniteam-report.xlsx")
                                .to_string();
                            let dir = downloads_handle
                                .path()
                                .download_dir()
                                .ok()
                                .or_else(|| destination.parent().map(|p| p.to_path_buf()));
                            if let Some(dir) = dir {
                                *destination = unique_path(&dir, &name);
                            }
                            true
                        }
                        DownloadEvent::Finished { path, success, .. } => {
                            if success {
                                if let Some(p) = path {
                                    let name = p
                                        .file_name()
                                        .and_then(|n| n.to_str())
                                        .unwrap_or("")
                                        .to_string();
                                    show_notification(
                                        &downloads_handle,
                                        "تم تنزيل التقرير",
                                        &format!("{}\nمحفوظ في مجلد التنزيلات (Downloads)", name),
                                    );
                                    reveal_in_explorer(&p);
                                }
                            } else {
                                show_notification(
                                    &downloads_handle,
                                    "تعذّر تنزيل الملف",
                                    "حاول مرة أخرى. إن تكرر الأمر تأكد من وجود مساحة كافية على الجهاز.",
                                );
                            }
                            true
                        }
                        _ => true,
                    }
                })
                .build()?;

            run_updater(app.handle().clone());
            Ok(())
        })
        // زر الإغلاق يخفي النافذة ويبقى التطبيق بجانب الساعة
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                    if !TRAY_HINT_SHOWN.swap(true, Ordering::SeqCst) {
                        show_notification(
                            window.app_handle(),
                            "Uniteam يعمل بجانب الساعة",
                            "لإغلاقه نهائياً: اضغط أيقونته بجانب الساعة بالزر الأيمن ثم «خروج».",
                        );
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("تعذّر تشغيل Uniteam");
}
