use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // 获取主窗口并设置
            if let Some(window) = app.get_webview_window("main") {
                // 设置用户代理为桌面浏览器，确保网页兼容性
                let _ = window.eval("navigator.__defineGetter__('userAgent', () => 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');");
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("启动应用失败");
}