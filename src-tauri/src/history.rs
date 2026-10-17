use serde::{Deserialize, Serialize};

use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

const MAX_SNAPSHOTS: usize = 20;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    #[serde(default)]
    pub id: String,

    #[serde(default)]
    pub created_at: u64,

    pub label: String,

    pub target: String,

    pub source: String,

    #[serde(default)]
    pub outputs: BTreeMap<String, String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotMeta {
    pub id: String,

    pub created_at: u64,

    pub label: String,

    pub target: String,
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn history_dir() -> Result<PathBuf, String> {
    let base = if let Ok(directory) = std::env::var("LOCALAPPDATA") {
        PathBuf::from(directory).join("Tint")
    } else if let Ok(directory) = std::env::var("HOME") {
        PathBuf::from(directory).join(".tint")
    } else {
        std::env::temp_dir().join("Tint")
    };

    let directory = base.join("history");

    fs::create_dir_all(&directory)
        .map_err(|error| format!("failed to create history directory: {error}"))?;

    Ok(directory)
}

fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '-')
}

fn snapshot_path(directory: &Path, id: &str) -> PathBuf {
    directory.join(format!("{id}.json"))
}

fn meta_path(directory: &Path, id: &str) -> PathBuf {
    directory.join(format!("{id}.meta.json"))
}

fn list_ids(directory: &Path) -> Result<Vec<String>, String> {
    let mut ids = Vec::new();

    let entries = fs::read_dir(directory)
        .map_err(|error| format!("failed to read history directory: {error}"))?;

    for entry in entries {
        let entry = entry.map_err(|error| format!("failed to read history entry: {error}"))?;

        let name = entry.file_name().to_string_lossy().into_owned();

        if let Some(id) = name.strip_suffix(".meta.json") {
            if valid_id(id) {
                ids.push(id.to_owned());
            }
        }
    }

    Ok(ids)
}

fn prune(directory: &Path) -> Result<(), String> {
    let mut ids = list_ids(directory)?;

    if ids.len() <= MAX_SNAPSHOTS {
        return Ok(());
    }

    ids.sort();

    let remove_count = ids.len() - MAX_SNAPSHOTS;

    for id in ids.into_iter().take(remove_count) {
        let _ = fs::remove_file(snapshot_path(directory, &id));

        let _ = fs::remove_file(meta_path(directory, &id));
    }

    Ok(())
}

pub fn save(mut snapshot: Snapshot) -> Result<SnapshotMeta, String> {
    let directory = history_dir()?;

    let created_at = now_millis();

    let id = format!("{created_at}-{}", std::process::id());

    snapshot.id = id.clone();

    snapshot.created_at = created_at;

    let json = serde_json::to_string(&snapshot)
        .map_err(|error| format!("failed to serialize snapshot: {error}"))?;

    fs::write(snapshot_path(&directory, &id), json)
        .map_err(|error| format!("failed to write snapshot: {error}"))?;

    let meta = SnapshotMeta {
        id,
        created_at,
        label: snapshot.label,
        target: snapshot.target,
    };

    let meta_json = serde_json::to_string(&meta)
        .map_err(|error| format!("failed to serialize snapshot metadata: {error}"))?;

    fs::write(meta_path(&directory, &meta.id), meta_json)
        .map_err(|error| format!("failed to write snapshot metadata: {error}"))?;

    prune(&directory)?;

    Ok(meta)
}

pub fn list() -> Result<Vec<SnapshotMeta>, String> {
    let directory = history_dir()?;

    let mut metas = Vec::new();

    for id in list_ids(&directory)? {
        let text = fs::read_to_string(meta_path(&directory, &id))
            .map_err(|error| format!("failed to read snapshot metadata: {error}"))?;

        let meta: SnapshotMeta = serde_json::from_str(&text)
            .map_err(|error| format!("failed to parse snapshot metadata: {error}"))?;

        metas.push(meta);
    }

    metas.sort_by(|left, right| right.created_at.cmp(&left.created_at));

    Ok(metas)
}

pub fn read(id: &str) -> Result<Snapshot, String> {
    if !valid_id(id) {
        return Err("invalid snapshot id".to_owned());
    }

    let directory = history_dir()?;

    let text = fs::read_to_string(snapshot_path(&directory, id))
        .map_err(|error| format!("failed to read snapshot: {error}"))?;

    serde_json::from_str(&text).map_err(|error| format!("failed to parse snapshot: {error}"))
}

pub fn delete(id: &str) -> Result<(), String> {
    if !valid_id(id) {
        return Err("invalid snapshot id".to_owned());
    }

    let directory = history_dir()?;

    let _ = fs::remove_file(snapshot_path(&directory, id));

    let _ = fs::remove_file(meta_path(&directory, id));

    Ok(())
}
