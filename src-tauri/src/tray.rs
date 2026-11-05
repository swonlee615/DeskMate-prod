//! 메뉴바 (v3 main.js applyTray · v3.1.65)
//! ★ 여기서는 아무것도 판단하지 않는다. 화면(src/app/useTray.ts)이 «그려야 할 모양» 을 통째로 보내고 그대로 세운다
//!   누른 항목의 id 는 `tray:command` 로 돌려보낸다. 명령의 뜻도 화면이 정한다
//! ponytail: v3 의 팝오버 카드(tray.html) · 마크 아이콘은 아직 — 기본 메뉴(v3 의 오른쪽 클릭 길)만
use serde::Deserialize;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager, Runtime};

const ID: &str = "main";

#[derive(Deserialize)]
pub struct Item {
  #[serde(default)]
  id: String,
  #[serde(default)]
  label: String,
  checked: Option<bool>,
  #[serde(default)]
  dim: bool,
  /// 창이 필요한 항목 — 누르면 창도 연다 (v3.1.100)
  #[serde(default)]
  opens: bool,
  #[serde(default)]
  sep: bool,
}

fn open<R: Runtime>(app: &AppHandle<R>) {
  if let Some(w) = app.get_webview_window("main") {
    let _ = w.unminimize();
    let _ = w.show();
    let _ = w.set_focus();
  }
}

fn build<R: Runtime>(app: &AppHandle<R>, head: &[String], items: &[Item]) -> tauri::Result<Menu<R>> {
  let m = Menu::new(app)?;
  for line in head {
    m.append(&MenuItem::new(app, line, false, None::<&str>)?)?;
  }
  if !head.is_empty() {
    m.append(&PredefinedMenuItem::separator(app)?)?;
  }
  for it in items {
    if it.sep {
      m.append(&PredefinedMenuItem::separator(app)?)?;
      continue;
    }
    // 창을 여는 항목은 id 앞에 '!' — 눌렸을 때 여기서 창을 열고 떼어 보낸다
    let id = if it.opens { format!("!{}", it.id) } else { it.id.clone() };
    match it.checked {
      Some(c) => m.append(&CheckMenuItem::with_id(app, id, &it.label, !it.dim, c, None::<&str>)?)?,
      None => m.append(&MenuItem::with_id(app, id, &it.label, !it.dim, None::<&str>)?)?,
    }
  }
  if !items.is_empty() {
    m.append(&PredefinedMenuItem::separator(app)?)?;
  }
  m.append(&MenuItem::with_id(app, "__open", "DeskMate 열기", true, None::<&str>)?)?;
  m.append(&PredefinedMenuItem::separator(app)?)?;
  m.append(&MenuItem::with_id(app, "!settings", "설정…", true, None::<&str>)?)?;
  m.append(&PredefinedMenuItem::quit(app, Some("종료"))?)?;
  Ok(m)
}

/// 개발 실행은 «DEV» 를 앞에 단다 — 설치한 앱과 같은 계정을 쓰므로 어느 쪽인지 늘 보이게 (v3 devMark)
fn mark(t: &str) -> String {
  if cfg!(debug_assertions) { format!("DEV {t}") } else { t.to_string() }
}

pub fn setup<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
  TrayIconBuilder::with_id(ID)
    .title(mark("DeskMate"))
    .tooltip("DeskMate")
    .menu(&build(app, &[], &[])?)
    .show_menu_on_left_click(true)
    .on_menu_event(|app, e| {
      let id = e.id().as_ref();
      if id == "__open" {
        open(app);
        return;
      }
      let cmd = match id.strip_prefix('!') {
        Some(rest) => {
          open(app);
          rest
        }
        None => id,
      };
      let _ = app.emit_to("main", "tray:command", cmd.to_string());
    })
    .build(app)?;
  Ok(())
}

/// 메뉴를 다시 세운다 — 화면이 «달라졌을 때만» 부른다 (열어 둔 메뉴가 눈앞에서 닫히지 않게)
#[tauri::command]
pub fn tray_set<R: Runtime>(app: AppHandle<R>, title: String, head: Vec<String>, items: Vec<Item>) -> Result<(), String> {
  let t = app.tray_by_id(ID).ok_or("no tray")?;
  t.set_menu(Some(build(&app, &head, &items).map_err(|e| e.to_string())?)).map_err(|e| e.to_string())?;
  t.set_title(Some(mark(&title))).map_err(|e| e.to_string())
}

/// 글자만 — 초 단위로 바뀌는 타이머 (메뉴는 안 건드린다)
#[tauri::command]
pub fn tray_title<R: Runtime>(app: AppHandle<R>, title: String) -> Result<(), String> {
  let t = app.tray_by_id(ID).ok_or("no tray")?;
  t.set_title(Some(mark(&title))).map_err(|e| e.to_string())
}
