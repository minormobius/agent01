//! Small DOM helpers, so the modules above read like code and not like
//! `web_sys` incantations.

use wasm_bindgen::prelude::*;
use web_sys::{Document, Element, Window};

pub fn window() -> Window {
    web_sys::window().expect("no window")
}

pub fn document() -> Document {
    window().document().expect("no document")
}

pub fn q(sel: &str) -> Option<Element> {
    document().query_selector(sel).ok().flatten()
}

pub fn qa(sel: &str) -> Vec<Element> {
    let Ok(list) = document().query_selector_all(sel) else { return Vec::new() };
    (0..list.length()).filter_map(|i| list.item(i)).filter_map(|n| n.dyn_into::<Element>().ok()).collect()
}

pub fn set_text(sel: &str, text: &str) {
    if let Some(e) = q(sel) {
        e.set_text_content(Some(text));
    }
}

/// Attach a click handler. The closure is `forget`-ed: these listeners live for
/// the lifetime of the page, and the alternative is threading an owner through
/// every call site to free memory the tab is about to reclaim anyway.
pub fn on_click(el: &Element, f: impl FnMut() + 'static) {
    let mut f = f;
    let cb = Closure::<dyn FnMut()>::new(move || f());
    let _ = el.add_event_listener_with_callback("click", cb.as_ref().unchecked_ref());
    cb.forget();
}

pub fn on_input(el: &Element, f: impl FnMut() + 'static) {
    let mut f = f;
    let cb = Closure::<dyn FnMut()>::new(move || f());
    let _ = el.add_event_listener_with_callback("input", cb.as_ref().unchecked_ref());
    cb.forget();
}

pub fn attr(el: &Element, name: &str) -> Option<String> {
    el.get_attribute(name)
}

pub fn add_class(el: &Element, c: &str) {
    let _ = el.class_list().add_1(c);
}

pub fn remove_class(el: &Element, c: &str) {
    let _ = el.class_list().remove_1(c);
}

pub fn set_disabled(el: &Element, disabled: bool) {
    if disabled {
        let _ = el.set_attribute("disabled", "");
    } else {
        let _ = el.remove_attribute("disabled");
    }
}

pub fn value(sel: &str) -> String {
    q(sel)
        .and_then(|e| e.dyn_into::<web_sys::HtmlTextAreaElement>().ok())
        .map(|t| t.value())
        .or_else(|| {
            q(sel).and_then(|e| e.dyn_into::<web_sys::HtmlInputElement>().ok()).map(|i| i.value())
        })
        .unwrap_or_default()
}

pub fn log(msg: &str) {
    web_sys::console::log_1(&JsValue::from_str(msg));
}
