//! 지금 맨 앞에 있는 앱 — 업무 앱 기준 자리비움 · 앱 사용 기록 (v3 main.js sys:frontApp)
//! 앱 이름 · 번들 ID · 실행 파일 이름만 읽고 어디에도 보내지 않는다. 권한을 묻지 않는다
//! (맥 NSWorkspace.frontmostApplication · 윈도우 GetForegroundWindow → 실행 파일 경로)

#[derive(serde::Serialize, Default)]
pub struct FrontApp {
  pub name: Option<String>,
  pub id: Option<String>,
  pub exec: Option<String>,
}

#[cfg(target_os = "macos")]
pub fn front_app() -> Option<FrontApp> {
  use objc2_app_kit::NSWorkspace;
  let app = NSWorkspace::sharedWorkspace().frontmostApplication()?;
  Some(FrontApp {
    name: app.localizedName().map(|s| s.to_string()),
    id: app.bundleIdentifier().map(|s| s.to_string()),
    exec: app.executableURL().and_then(|u| u.lastPathComponent()).map(|s| s.to_string()),
  })
}

#[cfg(windows)]
pub fn front_app() -> Option<FrontApp> {
  use std::ffi::c_void;
  #[link(name = "user32")]
  unsafe extern "system" {
    fn GetForegroundWindow() -> *mut c_void;
    fn GetWindowThreadProcessId(h: *mut c_void, pid: *mut u32) -> u32;
  }
  #[link(name = "kernel32")]
  unsafe extern "system" {
    fn OpenProcess(access: u32, inherit: i32, pid: u32) -> *mut c_void;
    fn QueryFullProcessImageNameW(h: *mut c_void, flags: u32, buf: *mut u16, len: *mut u32) -> i32;
    fn CloseHandle(h: *mut c_void) -> i32;
  }
  const PROCESS_QUERY_LIMITED_INFORMATION: u32 = 0x1000;
  unsafe {
    let w = GetForegroundWindow();
    if w.is_null() { return None; }
    let mut pid = 0u32;
    GetWindowThreadProcessId(w, &mut pid);
    let h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
    if h.is_null() { return None; }
    let mut buf = [0u16; 1024];
    let mut len = buf.len() as u32;
    let ok = QueryFullProcessImageNameW(h, 0, buf.as_mut_ptr(), &mut len);
    CloseHandle(h);
    if ok == 0 { return None; }
    let path = std::path::PathBuf::from(String::from_utf16_lossy(&buf[..len as usize]));
    let exec = path.file_name().map(|s| s.to_string_lossy().into_owned());
    let name = path.file_stem().map(|s| s.to_string_lossy().into_owned());
    Some(FrontApp { name, id: None, exec })
  }
}

/// 설치된 앱 — 업무 앱 · 딴짓 앱 고르기 목록 (v3 apps:list). 맥만. 윈도우는 이름을 직접 적거나 «최근 감지된 앱» 에서 고른다
#[cfg(target_os = "macos")]
pub fn installed_apps() -> Vec<FrontApp> {
  use objc2_foundation::{NSBundle, NSString};
  let home = std::env::var("HOME").unwrap_or_default();
  let roots = ["/Applications".to_string(), "/Applications/Utilities".into(), "/System/Applications".into(),
    "/System/Applications/Utilities".into(), format!("{home}/Applications")];
  let mut paths = vec![];
  for r in roots {
    let Ok(rd) = std::fs::read_dir(&r) else { continue };
    for e in rd.flatten() {
      let p = e.path();
      if p.extension().is_some_and(|x| x == "app") { paths.push(p); }
      else if p.is_dir() {
        // 폴더 안의 앱 한 단계 (예: /Applications/Microsoft Office/…)
        if let Ok(sub) = std::fs::read_dir(&p) {
          paths.extend(sub.flatten().map(|x| x.path()).filter(|x| x.extension().is_some_and(|y| y == "app")));
        }
      }
    }
  }
  let mut out: Vec<FrontApp> = paths.iter().map(|p| {
    let b = NSBundle::bundleWithPath(&NSString::from_str(&p.to_string_lossy()));
    FrontApp {
      name: p.file_stem().map(|s| s.to_string_lossy().into_owned()),
      id: b.as_ref().and_then(|b| b.bundleIdentifier()).map(|s| s.to_string()),
      exec: b.as_ref().and_then(|b| b.executablePath()).and_then(|s| s.to_string().rsplit('/').next().map(String::from)),
    }
  }).collect();
  out.sort_by_key(|a| a.name.clone().unwrap_or_default().to_lowercase());
  out.dedup_by_key(|a| a.name.clone());
  out
}

#[cfg(not(target_os = "macos"))]
pub fn installed_apps() -> Vec<FrontApp> { vec![] }

#[tauri::command]
pub fn installed_apps_list() -> Vec<FrontApp> { installed_apps() }

#[cfg(not(any(target_os = "macos", windows)))]
pub fn front_app() -> Option<FrontApp> { None }

#[tauri::command]
pub fn front_app_now() -> Option<FrontApp> { front_app() }

#[cfg(test)]
mod tests {
  #[test]
  fn reads_front_app() {
    let a = super::front_app();
    if let Some(a) = &a { println!("front = {:?} / {:?} / {:?}", a.name, a.id, a.exec); }
    let list = super::installed_apps();
    println!("installed = {} e.g. {:?}", list.len(), list.iter().find(|a| a.name.as_deref() == Some("Safari")).map(|a| (&a.id, &a.exec)));
  }
}
