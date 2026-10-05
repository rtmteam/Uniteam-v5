fn main() {
    // أوامر الغلاف التي يُسمح للموقع باستدعائها (انظر add_capability في main.rs)
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(&["notify"])),
    )
    .expect("failed to run tauri-build");
}
