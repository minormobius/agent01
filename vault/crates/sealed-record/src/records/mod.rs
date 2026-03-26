pub mod crm;
pub mod mail;
pub mod tasks;

/// Validate an inner record against its schema constraints.
///
/// This is a lightweight check — it verifies required fields are present
/// and basic type constraints hold. Full lexicon validation (string lengths,
/// array bounds, known values) can be added incrementally.
pub fn validate(inner_type: &str, value: &ciborium::Value) -> Result<(), String> {
    let map = value
        .as_map()
        .ok_or_else(|| "Record must be a CBOR map".to_string())?;

    let required_fields: &[&str] = match inner_type {
        "com.minomobi.crm.deal" => &["title", "stage", "createdAt"],
        "com.minomobi.crm.contact" => &["name", "createdAt"],
        "com.minomobi.crm.company" => &["name", "createdAt"],
        "com.minomobi.tasks.issue" => &["title", "status", "createdAt"],
        "com.minomobi.tasks.board" => &["name", "columns", "createdAt"],
        "com.minomobi.mail.message" => &["from", "to", "subject", "body", "createdAt"],
        "com.minomobi.mail.thread" => &["subject", "participants", "createdAt"],
        _ => return Err(format!("Unknown inner type: {inner_type}")),
    };

    for field in required_fields {
        let found = map.iter().any(|(k, _)| {
            matches!(k, ciborium::Value::Text(s) if s == field)
        });
        if !found {
            return Err(format!("Missing required field '{field}' for {inner_type}"));
        }
    }

    Ok(())
}
