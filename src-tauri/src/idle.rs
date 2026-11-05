//! 이 PC 전체의 «마지막 입력 뒤 지난 초» — 자리비움 감지 (src/app/useIdleAway.ts)
//! v3 Electron powerMonitor.getSystemIdleTime 과 같은 값. 다른 앱을 쓰고 있어도 키보드 · 마우스를 본다

#[cfg(target_os = "macos")]
pub fn idle_secs() -> Option<f64> {
  #[link(name = "ApplicationServices", kind = "framework")]
  unsafe extern "C" {
    fn CGEventSourceSecondsSinceLastEventType(state: i32, event_type: u32) -> f64;
  }
  // 0 = kCGEventSourceStateCombinedSessionState, !0 = kCGAnyInputEventType
  Some(unsafe { CGEventSourceSecondsSinceLastEventType(0, !0) })
}

#[cfg(windows)]
pub fn idle_secs() -> Option<f64> {
  #[repr(C)]
  struct LastInputInfo { cb_size: u32, dw_time: u32 }
  #[link(name = "user32")]
  unsafe extern "system" { fn GetLastInputInfo(p: *mut LastInputInfo) -> i32; }
  #[link(name = "kernel32")]
  unsafe extern "system" { fn GetTickCount() -> u32; }
  let mut li = LastInputInfo { cb_size: 8, dw_time: 0 };
  if unsafe { GetLastInputInfo(&mut li) } == 0 { return None; }
  Some(unsafe { GetTickCount() }.wrapping_sub(li.dw_time) as f64 / 1000.0)
}

#[cfg(not(any(target_os = "macos", windows)))]
pub fn idle_secs() -> Option<f64> { None }

#[tauri::command]
pub fn system_idle_secs() -> Option<f64> { idle_secs() }

#[cfg(test)]
mod tests {
  #[test]
  fn reads_idle_seconds() {
    let s = super::idle_secs();
    #[cfg(any(target_os = "macos", windows))]
    assert!(matches!(s, Some(x) if x >= 0.0), "{s:?}");
    println!("idle = {s:?}");
  }
}
