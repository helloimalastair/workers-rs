use serde::Deserialize;

#[derive(Deserialize, Debug, Clone)]
pub struct DurableObjectBinding {
    pub class_name: String,
}
