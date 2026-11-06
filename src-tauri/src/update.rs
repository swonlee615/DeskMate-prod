//! 자동 업데이트 (v3 에는 없다 · 2026-11-06 소유자 «알리고 고르게»)
//! 앱을 켤 때 화면이 update_check 로 묻고, 사용자가 누르면 update_install 이 받아서 설치하고 다시 켠다.
//! 파일은 GitHub Releases 의 latest.json (tauri.conf.json plugins.updater). 서명 키는 리포 밖 ~/.tauri/
use tauri::AppHandle;
use tauri_plugin_updater::UpdaterExt;

/// 새 버전이 있으면 그 버전 글자, 없으면 None. 오프라인 · 서버 오류도 None (조용히 넘긴다)
#[tauri::command]
pub async fn update_check(app: AppHandle) -> Option<String> {
  let u = app.updater().ok()?.check().await.ok()??;
  Some(u.version)
}

/// 받아서 설치하고 다시 켠다
#[tauri::command]
pub async fn update_install(app: AppHandle) -> Result<(), String> {
  let e = |x: tauri_plugin_updater::Error| x.to_string();
  let Some(u) = app.updater().map_err(e)?.check().await.map_err(e)? else { return Ok(()) };
  u.download_and_install(|_, _| {}, || {}).await.map_err(e)?;
  app.restart();
}
