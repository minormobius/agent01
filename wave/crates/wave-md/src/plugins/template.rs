use crate::TemplateVar;

/// Expand template variables in text.
///
/// Syntax: `{{variable_name}}` gets replaced with the variable value.
///
/// Built-in variables (always available):
/// - `{{date}}` — current date (YYYY-MM-DD)
/// - `{{time}}` — current time (HH:MM)
/// - `{{datetime}}` — ISO datetime
///
/// Custom variables are passed from the JS side when instantiating a template.
pub fn expand_template(text: &str, vars: &[TemplateVar]) -> String {
    let mut result = text.to_string();

    // Expand custom variables
    for var in vars {
        let pattern = format!("{{{{{}}}}}", var.key);
        result = result.replace(&pattern, &var.value);
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_expand_simple() {
        let vars = vec![
            TemplateVar {
                key: "title".to_string(),
                value: "My Page".to_string(),
            },
            TemplateVar {
                key: "author".to_string(),
                value: "alice".to_string(),
            },
        ];
        let result = expand_template("# {{title}}\nBy {{author}}", &vars);
        assert_eq!(result, "# My Page\nBy alice");
    }

    #[test]
    fn test_expand_no_match() {
        let vars = vec![];
        let result = expand_template("# {{title}}", &vars);
        assert_eq!(result, "# {{title}}");
    }

    #[test]
    fn test_expand_repeated() {
        let vars = vec![TemplateVar {
            key: "name".to_string(),
            value: "Wave".to_string(),
        }];
        let result = expand_template("{{name}} is {{name}}", &vars);
        assert_eq!(result, "Wave is Wave");
    }
}
