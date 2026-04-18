use super::WavePlugin;

/// Embed plugin — renders media embeds from special syntax.
///
/// Supports:
/// - `![[image.png]]` — image embeds (handled in wikilink expansion)
/// - ```embed blocks with URL content
/// - `![alt](url)` — standard markdown images (handled by pulldown-cmark)
///
/// This plugin handles fenced code block embeds:
/// ```embed
/// https://youtube.com/watch?v=...
/// ```
///
/// ```embed
/// https://bsky.app/profile/did/post/rkey
/// ```
pub struct EmbedPlugin;

impl WavePlugin for EmbedPlugin {
    fn process_code_block(&self, info: &str, code: &str) -> Option<String> {
        if info.trim() != "embed" {
            return None;
        }
        Some(render_embed(code))
    }
}

fn render_embed(code: &str) -> String {
    let url = code.trim();
    if url.is_empty() {
        return String::new();
    }

    // YouTube
    if let Some(video_id) = extract_youtube_id(url) {
        return format!(
            "<div class=\"wave-embed wave-embed-youtube\">\
             <iframe src=\"https://www.youtube-nocookie.com/embed/{}\" \
             frameborder=\"0\" allowfullscreen loading=\"lazy\" \
             sandbox=\"allow-scripts allow-same-origin\"></iframe>\
             </div>\n",
            html_escape(&video_id)
        );
    }

    // Bluesky post
    if url.contains("bsky.app/profile/") && url.contains("/post/") {
        return format!(
            "<div class=\"wave-embed wave-embed-bsky\" data-url=\"{}\">\
             <a href=\"{}\" target=\"_blank\" rel=\"noopener\">View on Bluesky</a>\
             </div>\n",
            html_escape(url),
            html_escape(url)
        );
    }

    // Image URLs
    if is_image_url(url) {
        return format!(
            "<div class=\"wave-embed wave-embed-image\">\
             <img src=\"{}\" alt=\"embedded image\" loading=\"lazy\" />\
             </div>\n",
            html_escape(url)
        );
    }

    // Generic URL — render as a styled link card
    format!(
        "<div class=\"wave-embed wave-embed-link\">\
         <a href=\"{}\" target=\"_blank\" rel=\"noopener\">{}</a>\
         </div>\n",
        html_escape(url),
        html_escape(url)
    )
}

fn extract_youtube_id(url: &str) -> Option<String> {
    // youtube.com/watch?v=ID or youtu.be/ID
    if url.contains("youtube.com/watch") {
        if let Some(pos) = url.find("v=") {
            let rest = &url[pos + 2..];
            let id: String = rest.chars().take_while(|c| c.is_alphanumeric() || *c == '-' || *c == '_').collect();
            if !id.is_empty() {
                return Some(id);
            }
        }
    } else if url.contains("youtu.be/") {
        if let Some(pos) = url.find("youtu.be/") {
            let rest = &url[pos + 9..];
            let id: String = rest.chars().take_while(|c| c.is_alphanumeric() || *c == '-' || *c == '_').collect();
            if !id.is_empty() {
                return Some(id);
            }
        }
    }
    None
}

fn is_image_url(url: &str) -> bool {
    let lower = url.to_lowercase();
    lower.ends_with(".png")
        || lower.ends_with(".jpg")
        || lower.ends_with(".jpeg")
        || lower.ends_with(".gif")
        || lower.ends_with(".webp")
        || lower.ends_with(".svg")
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
    fn test_youtube_embed() {
        let plugin = EmbedPlugin;
        let result = plugin
            .process_code_block("embed", "https://youtube.com/watch?v=dQw4w9WgXcQ")
            .unwrap();
        assert!(result.contains("youtube-nocookie.com/embed/dQw4w9WgXcQ"));
        assert!(result.contains("sandbox"));
    }

    #[test]
    fn test_bsky_embed() {
        let plugin = EmbedPlugin;
        let result = plugin
            .process_code_block("embed", "https://bsky.app/profile/did:plc:abc/post/xyz")
            .unwrap();
        assert!(result.contains("wave-embed-bsky"));
        assert!(result.contains("View on Bluesky"));
    }

    #[test]
    fn test_image_embed() {
        let plugin = EmbedPlugin;
        let result = plugin
            .process_code_block("embed", "https://example.com/photo.png")
            .unwrap();
        assert!(result.contains("<img"));
        assert!(result.contains("loading=\"lazy\""));
    }
}
