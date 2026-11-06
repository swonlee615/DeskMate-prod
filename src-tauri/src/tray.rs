//! 메뉴바 (v3 main.js applyTray · 팝오버 v3.2.0)
//! ★ 여기서는 아무것도 판단하지 않는다. 화면(src/app/useTray.ts)이 «그려야 할 모양» 을 통째로 보내고 그대로 세운다
//!   누른 항목의 id 는 `tray:command` 로 돌려보낸다. 명령의 뜻도 화면이 정한다
//! ★ 왼쪽 클릭 = 팝오버(public/tray.html — 카드 · 색 단추), 오른쪽 클릭 = 같은 상태로 만든 기본 메뉴(예비 길)
use serde::Deserialize;
use serde_json::Value;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::image::Image;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, Runtime, WebviewUrl, WebviewWindowBuilder, WindowEvent};

const ID: &str = "main";
const POP: &str = "tray";
/// 시안 폭. 항목이 길면 tray.html 이 넓혀 달라고 한다 (최대 420)
const POP_W: f64 = 252.0;

#[derive(Deserialize, Clone)]
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

#[derive(Deserialize)]
struct Card {
  #[serde(default)]
  title: String,
  #[serde(default)]
  actions: Vec<Item>,
}

#[derive(Deserialize)]
struct St {
  #[serde(default)]
  title: String,
  #[serde(default)]
  head: Vec<String>,
  #[serde(default)]
  items: Vec<Item>,
  card: Option<Card>,
  missed: Option<Card>,
}

#[derive(Default)]
struct Ctx {
  /// 화면이 마지막으로 보낸 상태 그대로 — 팝오버가 그린다
  last: Mutex<Value>,
  /// 마지막으로 누른 메뉴바 아이콘 자리 (물리 픽셀 x, y, w, h)
  rect: Mutex<Option<(f64, f64, f64, f64)>>,
  /// 팝오버가 포커스를 잃고 닫힌 때 — 바로 뒤 아이콘 클릭은 «닫으려던 클릭» 이다
  hid: Mutex<Option<Instant>>,
}

fn open<R: Runtime>(app: &AppHandle<R>) {
  if let Some(w) = app.get_webview_window("main") {
    let _ = w.unminimize();
    let _ = w.show();
    let _ = w.set_focus();
  }
}

fn item<R: Runtime>(app: &AppHandle<R>, m: &Menu<R>, it: &Item) -> tauri::Result<()> {
  if it.sep {
    return m.append(&PredefinedMenuItem::separator(app)?);
  }
  // 창을 여는 항목은 id 앞에 '!' — 눌렸을 때 여기서 창을 열고 떼어 보낸다
  let id = if it.opens { format!("!{}", it.id) } else { it.id.clone() };
  match it.checked {
    Some(c) => m.append(&CheckMenuItem::with_id(app, id, &it.label, !it.dim, c, None::<&str>)?),
    None => m.append(&MenuItem::with_id(app, id, &it.label, !it.dim, None::<&str>)?),
  }
}

/// 오른쪽 클릭 기본 메뉴 — 카드의 답은 맨 위 줄로 선다 (v3 applyTray)
fn build<R: Runtime>(app: &AppHandle<R>, st: &St) -> tauri::Result<Menu<R>> {
  let m = Menu::new(app)?;
  for line in &st.head {
    m.append(&MenuItem::new(app, line, false, None::<&str>)?)?;
  }
  if !st.head.is_empty() {
    m.append(&PredefinedMenuItem::separator(app)?)?;
  }
  for c in [&st.missed, &st.card].into_iter().flatten() {
    m.append(&MenuItem::new(app, &c.title, false, None::<&str>)?)?;
    for a in &c.actions {
      item(app, &m, a)?;
    }
    m.append(&PredefinedMenuItem::separator(app)?)?;
  }
  for it in &st.items {
    item(app, &m, it)?;
  }
  if !st.items.is_empty() {
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

/// 누른 id → 화면으로. '!' 는 창부터 연다
fn send<R: Runtime>(app: &AppHandle<R>, id: &str) {
  match id {
    "__open" => open(app),
    "__quit" => app.exit(0),
    _ => {
      let cmd = match id.strip_prefix('!') {
        Some(rest) => {
          open(app);
          rest
        }
        None => id,
      };
      let _ = app.emit_to("main", "tray:command", cmd.to_string());
    }
  }
}

/// 팝오버를 아이콘 바로 아래 가운데에. 화면 밖으로 나가지 않게 6px 안쪽으로
fn place<R: Runtime>(app: &AppHandle<R>) {
  let (Some(w), Some((x, y, rw, rh))) = (app.get_webview_window(POP), *app.state::<Ctx>().rect.lock().unwrap()) else { return };
  let s = w.scale_factor().unwrap_or(1.0);
  let pw = w.outer_size().map(|z| z.width as f64).unwrap_or(POP_W * s);
  let mut px = x + rw / 2.0 - pw / 2.0;
  if let Ok(Some(mon)) = app.monitor_from_point(x, y) {
    let (mx, mw) = (mon.position().x as f64, mon.size().width as f64);
    px = px.max(mx + 6.0 * s).min(mx + mw - pw - 6.0 * s);
  }
  let _ = w.set_position(PhysicalPosition::new(px, y + rh + 4.0 * s));
}

fn toggle<R: Runtime>(app: &AppHandle<R>) {
  let Some(w) = app.get_webview_window(POP) else { return };
  if w.is_visible().unwrap_or(false) {
    let _ = w.hide();
    return;
  }
  if app.state::<Ctx>().hid.lock().unwrap().is_some_and(|t| t.elapsed() < Duration::from_millis(250)) {
    return;
  }
  place(app);
  let _ = w.show();
  let _ = w.set_focus();
}

pub fn setup<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
  app.manage(Ctx::default());
  let pop = WebviewWindowBuilder::new(app, POP, WebviewUrl::App("tray.html".into()))
    .title("DeskMate")
    .inner_size(POP_W, 300.0)
    .visible(false)
    .focused(false)
    .decorations(false)
    .transparent(true)
    .shadow(true)
    .resizable(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .visible_on_all_workspaces(true)
    .build()?;
  let h = app.clone();
  pop.on_window_event(move |e| {
    if let WindowEvent::Focused(false) = e {
      if let Some(w) = h.get_webview_window(POP) {
        if w.is_visible().unwrap_or(false) {
          let _ = w.hide();
          *h.state::<Ctx>().hid.lock().unwrap() = Some(Instant::now());
        }
      }
    }
  });

  TrayIconBuilder::with_id(ID)
    .title(mark("DeskMate"))
    .tooltip("DeskMate")
    .menu(&build(app, &St { title: String::new(), head: vec![], items: vec![], card: None, missed: None })?)
    .show_menu_on_left_click(false)
    .on_menu_event(|app, e| send(app, e.id().as_ref()))
    .on_tray_icon_event(|t, e| {
      if let TrayIconEvent::Click { rect, button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = e {
        let app = t.app_handle();
        let s = app.get_webview_window(POP).and_then(|w| w.scale_factor().ok()).unwrap_or(1.0);
        let p = rect.position.to_physical::<f64>(s);
        let z = rect.size.to_physical::<f64>(s);
        *app.state::<Ctx>().rect.lock().unwrap() = Some((p.x, p.y, z.width, z.height));
        toggle(app);
      }
    })
    .build(app)?;
  Ok(())
}

/// 상태 전체 — 화면이 «달라졌을 때만» 부른다 (열어 둔 메뉴가 눈앞에서 닫히지 않게)
#[tauri::command]
pub fn tray_set<R: Runtime>(app: AppHandle<R>, st: Value) -> Result<(), String> {
  let parsed: St = serde_json::from_value(st.clone()).map_err(|e| e.to_string())?;
  let t = app.tray_by_id(ID).ok_or("no tray")?;
  t.set_menu(Some(build(&app, &parsed).map_err(|e| e.to_string())?)).map_err(|e| e.to_string())?;
  t.set_title(Some(mark(&parsed.title))).map_err(|e| e.to_string())?;
  *app.state::<Ctx>().last.lock().unwrap() = st.clone();
  let _ = app.emit_to(POP, "tray:render", st);
  Ok(())
}

/// 글자만 — 초 단위로 바뀌는 타이머 (메뉴는 안 건드린다)
#[tauri::command]
pub fn tray_title<R: Runtime>(app: AppHandle<R>, title: String) -> Result<(), String> {
  let t = app.tray_by_id(ID).ok_or("no tray")?;
  t.set_title(Some(mark(&title))).map_err(|e| e.to_string())
}

/// 마크 — 화면이 캔버스로 그린 PNG. 템플릿 이미지라 OS 가 밝은/어두운 메뉴바에 맞춰 칠한다 (v3.1.72)
#[tauri::command]
pub fn tray_icon<R: Runtime>(app: AppHandle<R>, png: Vec<u8>) -> Result<(), String> {
  let t = app.tray_by_id(ID).ok_or("no tray")?;
  t.set_icon(Some(Image::from_bytes(&png).map_err(|e| e.to_string())?)).map_err(|e| e.to_string())?;
  t.set_icon_as_template(true).map_err(|e| e.to_string())
}

/// 팝오버가 처음 뜰 때 그릴 상태
#[tauri::command]
pub fn tray_last<R: Runtime>(app: AppHandle<R>) -> Value {
  app.state::<Ctx>().last.lock().unwrap().clone()
}

/// 팝오버에서 누른 것 — 닫고 나서 보낸다. 모르는 id(Esc 의 '__close')는 닫기만
#[tauri::command]
pub fn tray_pick<R: Runtime>(app: AppHandle<R>, id: String) {
  if let Some(w) = app.get_webview_window(POP) {
    let _ = w.hide();
  }
  if id == "__close" {
    return;
  }
  if id == "__settings" {
    return send(&app, "!settings");
  }
  if id == "__open" || id == "__quit" {
    return send(&app, &id);
  }
  // 창이 필요한 항목인지는 화면이 보낸 상태에 적혀 있다
  let last = app.state::<Ctx>().last.lock().unwrap().clone();
  let Ok(st) = serde_json::from_value::<St>(last) else { return };
  let all = st.items.iter().chain(st.card.iter().flat_map(|c| c.actions.iter())).chain(st.missed.iter().flat_map(|c| c.actions.iter()));
  if let Some(it) = all.into_iter().find(|x| x.id == id) {
    send(&app, &if it.opens { format!("!{id}") } else { id.clone() });
  }
}

/// 팝오버 크기 — 그린 뒤 높이 · 폭을 알려 온다
#[tauri::command]
pub fn tray_size<R: Runtime>(app: AppHandle<R>, w: f64, h: f64) {
  let Some(win) = app.get_webview_window(POP) else { return };
  let _ = win.set_size(LogicalSize::new(w.clamp(POP_W, 420.0), h.clamp(80.0, 640.0)));
  if win.is_visible().unwrap_or(false) {
    place(&app);
  }
}
