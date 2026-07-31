//! Starters for the composer.
//!
//! Low key on purpose. A template here is a shape you can delete your way out
//! of, not a form to fill in: three or four lines, a frontmatter block with the
//! title left blank, and a first sentence that starts mid-thought so the empty
//! box is no longer empty. Anything longer becomes something you edit *around*
//! rather than write *through*.
//!
//! The `date` is deliberately absent from every body. `Doc::parse` leaves an
//! undated post undated and the composer stamps it at publish time; a template
//! that hard-coded a date would either be wrong or would need a clock, and this
//! crate does not have one.

/// One starter.
pub struct Template {
    pub id: &'static str,
    /// The chip label. Lowercase, one word where possible.
    pub label: &'static str,
    /// One line, shown as the chip's tooltip. What this shape is *for*.
    pub blurb: &'static str,
    pub body: &'static str,
}

pub const ALL: &[Template] = &[
    Template {
        id: "rant",
        label: "rant",
        blurb: "The default: a claim, and then why. Starts mid-thought on purpose.",
        body: "---\ntitle: \ntags: \n---\n\nThe thing nobody says about this is that\n",
    },
    Template {
        id: "note",
        label: "note",
        blurb: "Short. No title fuss — the first line becomes the title.",
        body: "Noticed today:\n",
    },
    Template {
        id: "review",
        label: "review",
        blurb: "A thing, a verdict, and the reason — in that order.",
        body: "---\ntitle: \ntags: review\n---\n\n**The thing.** \n\n**The verdict.** \n\n**Why.** \n",
    },
    Template {
        id: "log",
        label: "log",
        blurb: "A running list. Good for a week of small things.",
        body: "---\ntitle: \ntags: log\n---\n\n- \n- \n- \n",
    },
    Template {
        id: "letter",
        label: "letter",
        blurb: "Addressed to someone. Changes how you write, which is the point.",
        body: "---\ntitle: \n---\n\nDear —,\n\n",
    },
    Template {
        id: "against",
        label: "against",
        blurb: "State the case you are arguing with first, as well as you can.",
        body: "---\ntitle: \n---\n\nThe strongest version of the argument is:\n\n> \n\nHere is where it breaks.\n",
    },
];

pub fn get(id: &str) -> Option<&'static Template> {
    ALL.iter().find(|t| t.id == id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::doc::Doc;

    #[test]
    fn ids_and_labels_are_unique() {
        let mut ids = std::collections::BTreeSet::new();
        let mut labels = std::collections::BTreeSet::new();
        for t in ALL {
            assert!(ids.insert(t.id), "duplicate id {}", t.id);
            assert!(labels.insert(t.label), "duplicate label {}", t.label);
            assert!(!t.blurb.is_empty());
            assert_eq!(get(t.id).map(|x| x.id), Some(t.id));
        }
        assert!(get("nope").is_none());
    }

    #[test]
    fn every_template_parses_as_a_post() {
        // A starter that the engine cannot read would be a trap: you would only
        // find out when you pressed Post.
        for t in ALL {
            let d = Doc::parse(t.body, t.id);
            assert!(!d.slug.is_empty(), "{}", t.id);
            // The title is left blank on purpose; parsing must survive that
            // rather than panicking or inventing one from frontmatter noise.
            assert!(!d.title.is_empty(), "{} produced no title at all", t.id);
        }
    }

    #[test]
    fn no_template_carries_a_date() {
        // The composer stamps publishedAt at post time. A hard-coded date would
        // be a lie about when the post was written.
        for t in ALL {
            assert!(Doc::parse(t.body, t.id).published.is_empty(), "{} has a date", t.id);
        }
    }

    #[test]
    fn templates_stay_short_enough_to_delete_your_way_out_of() {
        for t in ALL {
            let lines = t.body.lines().count();
            assert!(lines <= 14, "{} is {lines} lines — that is a form, not a starter", t.id);
        }
    }

    #[test]
    fn every_template_renders() {
        for t in ALL {
            let d = Doc::parse(t.body, t.id);
            let r = crate::render_body(d.body, &[], &crate::Opts::default());
            let _ = r.html; // must not panic on a mostly-empty body
        }
    }
}
