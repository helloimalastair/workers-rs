use crate::wrangler_config::WranglerConfig;
use anyhow::{anyhow, Result};
use std::{fs::read_to_string, path::Path};

/// Strip both single-line (`//`) and multi-line (`/* */`) comments from JSONC.
fn strip_jsonc_comments(input: &str) -> String {
    let mut output = String::with_capacity(input.len());
    let chars: Vec<char> = input.chars().collect();
    let mut i = 0;

    while i < chars.len() {
        // Single-line comment
        if chars[i] == '/' && i + 1 < chars.len() && chars[i + 1] == '/' {
            i += 2;
            while i < chars.len() && chars[i] != '\n' {
                i += 1;
            }
            continue;
        }
        // Multi-line comment
        if chars[i] == '/' && i + 1 < chars.len() && chars[i + 1] == '*' {
            i += 2;
            while i + 1 < chars.len() {
                if chars[i] == '*' && chars[i + 1] == '/' {
                    i += 2;
                    break;
                }
                i += 1;
            }
            continue;
        }
        // String literal (skip over it to avoid stripping "//" inside strings)
        if chars[i] == '"' {
            output.push(chars[i]);
            i += 1;
            while i < chars.len() {
                if chars[i] == '\\' && i + 1 < chars.len() {
                    output.push(chars[i]);
                    output.push(chars[i + 1]);
                    i += 2;
                    continue;
                }
                output.push(chars[i]);
                if chars[i] == '"' {
                    i += 1;
                    break;
                }
                i += 1;
            }
            continue;
        }
        output.push(chars[i]);
        i += 1;
    }

    output
}

/// Strip trailing commas from JSON (commas before `]` or `}`).
fn strip_trailing_commas(input: &str) -> String {
    let mut output = String::with_capacity(input.len());
    let chars: Vec<char> = input.chars().collect();
    let mut i = 0;

    while i < chars.len() {
        if chars[i] == ',' {
            // Look ahead to see if this is a trailing comma
            let mut j = i + 1;
            while j < chars.len() && chars[j].is_whitespace() {
                j += 1;
            }
            if j < chars.len() && (chars[j] == ']' || chars[j] == '}') {
                // Skip this comma
                i += 1;
                continue;
            }
        }
        output.push(chars[i]);
        i += 1;
    }

    output
}

pub fn get_wrangler_config_from_json(path: &Path) -> Result<WranglerConfig> {
    let content = read_to_string(path)
        .map_err(|e| anyhow!("Failed to read {:?}: {}", path, e))?;

    let stripped = strip_jsonc_comments(&content);
    let cleaned = strip_trailing_commas(&stripped);

    let config: WranglerConfig = serde_json::from_str(&cleaned)
        .map_err(|e| anyhow!("Failed to parse {:?}: {}", path, e))?;

    Ok(config)
}
