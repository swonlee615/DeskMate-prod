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

/// 화면이 잠겨 있나 (v3 powerMonitor lock-screen ~ unlock-screen). 잠금 해제는 사람이 비밀번호를 넣은 것이라 «돌아왔다» 의 가장 확실한 신호
/// 맥 = CGSessionCopyCurrentDictionary 의 CGSSessionScreenIsLocked (잠겨 있을 때만 키가 있다)
#[cfg(target_os = "macos")]
pub fn screen_locked() -> Option<bool> {
  use std::ffi::{c_char, c_void};
  type Ref = *const c_void;
  #[link(name = "CoreGraphics", kind = "framework")]
  unsafe extern "C" { fn CGSessionCopyCurrentDictionary() -> Ref; }
  #[link(name = "CoreFoundation", kind = "framework")]
  unsafe extern "C" {
    fn CFStringCreateWithCString(a: Ref, s: *const c_char, enc: u32) -> Ref;
    fn CFDictionaryGetValue(d: Ref, k: Ref) -> Ref;
    fn CFBooleanGetValue(b: Ref) -> u8;
    fn CFRelease(r: Ref);
  }
  unsafe {
    let d = CGSessionCopyCurrentDictionary();
    if d.is_null() { return None; }
    let k = CFStringCreateWithCString(std::ptr::null(), c"CGSSessionScreenIsLocked".as_ptr(), 0x0800_0100);
    let v = CFDictionaryGetValue(d, k);
    let locked = !v.is_null() && CFBooleanGetValue(v) != 0;
    CFRelease(k);
    CFRelease(d);
    Some(locked)
  }
}

// ponytail: 윈도우는 잠금을 아직 안 읽는다 (입력 30초 규칙만). 필요하면 WTSRegisterSessionNotification
#[cfg(not(target_os = "macos"))]
pub fn screen_locked() -> Option<bool> { None }

#[tauri::command]
pub fn screen_locked_now() -> Option<bool> { screen_locked() }

#[cfg(test)]
mod tests {
  #[test]
  fn reads_idle_seconds() {
    let s = super::idle_secs();
    #[cfg(any(target_os = "macos", windows))]
    assert!(matches!(s, Some(x) if x >= 0.0), "{s:?}");
    println!("idle = {s:?}");
  }

  #[test]
  fn reads_screen_lock() {
    let l = super::screen_locked();
    #[cfg(target_os = "macos")]
    assert_eq!(l, Some(false), "시험은 잠금을 푼 채로 돈다");
    println!("locked = {l:?}");
  }
}
