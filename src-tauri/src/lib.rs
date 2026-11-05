use tauri::Manager;

mod front;
mod idle;
mod tray;

/// 시스템 알림 (v3 bridge.notify) — 단추는 못 단다. 누르면 앱이 앞으로 온다
#[tauri::command]
fn notify(app: tauri::AppHandle, title: String, body: String) -> Result<(), String> {
  use tauri_plugin_notification::NotificationExt;
  app.notification().builder().title(title).body(body).show().map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    // 두 번째 실행(윈도우에서 deskmate:// 를 열 때 등)은 이미 떠 있는 창으로 넘긴다. 반드시 맨 앞에 둔다
    .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
      if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.set_focus();
      }
    }))
    // 브라우저 로그인에서 돌아오는 길 (deskmate://auth?…) — src/data/desktopLogin.ts
    .plugin(tauri_plugin_deep_link::init())
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_notification::init())
    // 창 위치 · 크기를 기억한다 (v3 winBounds 와 같은 동작)
    .plugin(tauri_plugin_window_state::Builder::default().build())
    .invoke_handler(tauri::generate_handler![idle::system_idle_secs, front::front_app_now, front::installed_apps_list, tray::tray_set, tray::tray_title, notify])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      // 윈도우 · 리눅스 개발 실행에서는 설치 없이도 주소를 등록해 둔다 (맥은 설치한 앱만)
      #[cfg(any(windows, target_os = "linux"))]
      {
        use tauri_plugin_deep_link::DeepLinkExt;
        let _ = app.deep_link().register_all();
      }
      tray::setup(app.handle())?;
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
