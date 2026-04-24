use super::DurableObjectBinding;
use serde::Deserialize;

#[derive(Deserialize, Debug, Clone)]
pub struct DurableObjectsConfig {
    #[serde(default)]
    pub bindings: Vec<DurableObjectBinding>,
}
