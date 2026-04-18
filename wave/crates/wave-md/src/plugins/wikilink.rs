use crate::TitleEntry;
use std::collections::HashMap;

/// Extract all [[wikilink]] targets from markdown text
pub fn extract_wikilinks(text: &str) -> Vec<String> {
    let mut links = Vec::new();
    let bytes = text.as_bytes();
    let len = bytes.len();
    let mut i = 0;

    while i + 1 < len {
        if bytes[i] == b'[' && bytes[i + 1] == b'[' {
            let start = i + 2;
            let mut j = start;
            while j + 1 < len {
                if bytes[j] == b']' && bytes[j + 1] == b']' {
                    let inner = &text[start..j];
                    if !inner.is_empty() {
                        let actual = if let Some(pos) = inner.find('|') {
                            inner[pos + 1..].trim().to_string()
                        } else {
                            inner.trim().to_string()
                        };
                        if !actual.is_empty() {
                            links.push(actual);
                        }
                    }
                    i = j + 2;
                    break;
                }
                j += 1;
            }
            if j + 1 >= len {
                i += 1; // unclosed [[, skip
            }
        } else {
            i += 1;
        }
    }
    links
}

/// Build a case-insensitive title -> rkey lookup map
pub fn build_title_map(index: &[TitleEntry]) -> HashMap<String, String> {
    let mut map = HashMap::new();
    for entry in index {
        map.insert(entry.title.to_lowercase(), entry.rkey.clone());
    }
    map
}

/// Replace [[wikilinks]] in already-HTML-escaped text with anchor tags.
/// This operates on the raw markdown BEFORE pulldown-cmark processing,
/// since pulldown-cmark doesn't know about wikilinks.
pub fn expand_wikilinks(text: &str, title_map: &HashMap<String, String>) -> String {
    let mut result = String::with_capacity(text.len());
    let bytes = text.as_bytes();
    let len = bytes.len();
    let mut i = 0;

    while i < len {
        if i + 1 < len && bytes[i] == b'[' && bytes[i + 1] == b'[' {
            // Found [[, scan for ]]
            let start = i + 2;
            let mut end = None;
            let mut j = start;
            while j + 1 < len {
                if bytes[j] == b']' && bytes[j + 1] == b']' {
                    end = Some(j);
                    break;
                }
                j += 1;
            }

            if let Some(end_pos) = end {
                let inner = &text[start..end_pos];
                let (display, target) = if let Some(pipe) = inner.find('|') {
                    (&inner[..pipe], inner[pipe + 1..].trim())
                } else {
                    (inner, inner.trim())
                };

                let target_lower = target.to_lowercase();
                if let Some(rkey) = title_map.get(&target_lower) {
                    result.push_str(&format!(
                        "<a class=\"wiki-link\" data-rkey=\"{}\">{}</a>",
                        html_escape(rkey),
                        html_escape(display.trim())
                    ));
                } else {
                    result.push_str(&format!(
                        "<a class=\"wiki-link wiki-link-missing\" data-title=\"{}\">{}</a>",
                        html_escape(target),
                        html_escape(display.trim())
                    ));
                }
                i = end_pos + 2;
            } else {
                result.push(bytes[i] as char);
                i += 1;
            }
        } else {
            result.push(bytes[i] as char);
            i += 1;
        }
    }
    result
}

fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_wikilinks() {
        let links = extract_wikilinks("Hello [[World]] and [[Foo Bar]]!");
        assert_eq!(links, vec!["World", "Foo Bar"]);
    }

    #[test]
    fn test_extract_pipe_syntax() {
        let links = extract_wikilinks("See [[displayed text|Target Page]]");
        assert_eq!(links, vec!["Target Page"]);
    }

    #[test]
    fn test_expand_wikilinks_found() {
        let mut map = HashMap::new();
        map.insert("hello world".to_string(), "abc123".to_string());
        let result = expand_wikilinks("Visit [[Hello World]] now", &map);
        assert!(result.contains("data-rkey=\"abc123\""));
        assert!(result.contains("Hello World</a>"));
    }

    #[test]
    fn test_expand_wikilinks_missing() {
        let map = HashMap::new();
        let result = expand_wikilinks("Visit [[Missing Page]] now", &map);
        assert!(result.contains("wiki-link-missing"));
    }
}
