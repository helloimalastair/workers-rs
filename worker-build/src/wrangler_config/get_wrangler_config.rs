use super::{get_wrangler_config_from_json, get_wrangler_config_from_toml, WranglerConfig};
use anyhow::Result;
use std::env::current_dir;

pub fn get_wrangler_config() -> Result<WranglerConfig> {
    let root = current_dir()?;

    let jsonc = root.join("wrangler.jsonc");
    if jsonc.exists() {
        return get_wrangler_config_from_json(&jsonc);
    }

    let json = root.join("wrangler.json");
    if json.exists() {
        return get_wrangler_config_from_json(&json);
    }

    let toml = root.join("wrangler.toml");
    if toml.exists() {
        return get_wrangler_config_from_toml(&toml);
    }

    Ok(WranglerConfig::default())
}
