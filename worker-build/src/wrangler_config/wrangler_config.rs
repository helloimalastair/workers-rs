use super::DurableObjectsConfig;
use serde::Deserialize;

#[derive(Deserialize, Debug, Clone)]
pub struct WranglerConfig {
    pub durable_objects: Option<DurableObjectsConfig>,
}

impl Default for WranglerConfig {
    fn default() -> Self {
        WranglerConfig {
            durable_objects: None,
        }
    }
}
