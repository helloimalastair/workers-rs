use crate::wrangler_config::get_wrangler_config;
use anyhow::Result;

pub fn get_durable_object_class_names() -> Result<Vec<String>> {
    let config = get_wrangler_config()?;

    let mut names = Vec::new();

    if let Some(do_config) = config.durable_objects {
        for binding in do_config.bindings {
            if !binding.class_name.is_empty() && !names.contains(&binding.class_name) {
                names.push(binding.class_name);
            }
        }
    }

    Ok(names)
}
