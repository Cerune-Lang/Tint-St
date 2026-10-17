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

pub fn save(snapshot: Snapshot) -> Result<SnapshotMeta, String> {
    let directory = history_dir()?;

    save_into(&directory, snapshot, now_millis())
}

fn save_into(
    directory: &Path,
    mut snapshot: Snapshot,
    created_at: u64,
) -> Result<SnapshotMeta, String> {
    let id = format!("{created_at}-{}", std::process::id());

    snapshot.id = id.clone();

    snapshot.created_at = created_at;

    let json = serde_json::to_string(&snapshot)
        .map_err(|error| format!("failed to serialize snapshot: {error}"))?;

    fs::write(snapshot_path(directory, &id), json)
        .map_err(|error| format!("failed to write snapshot: {error}"))?;

    let meta = SnapshotMeta {
        id,
        created_at,
        label: snapshot.label,
        target: snapshot.target,
    };

    let meta_json = serde_json::to_string(&meta)
        .map_err(|error| format!("failed to serialize snapshot metadata: {error}"))?;

    fs::write(meta_path(directory, &meta.id), meta_json)
        .map_err(|error| format!("failed to write snapshot metadata: {error}"))?;

    prune(directory)?;

    Ok(meta)
}

pub fn list() -> Result<Vec<SnapshotMeta>, String> {
    list_into(&history_dir()?)
}

fn list_into(directory: &Path) -> Result<Vec<SnapshotMeta>, String> {
    let mut metas = Vec::new();

    for id in list_ids(directory)? {
        let text = fs::read_to_string(meta_path(directory, &id))
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

    read_into(&history_dir()?, id)
}

fn read_into(directory: &Path, id: &str) -> Result<Snapshot, String> {
    let text = fs::read_to_string(snapshot_path(directory, id))
        .map_err(|error| format!("failed to read snapshot: {error}"))?;

    serde_json::from_str(&text).map_err(|error| format!("failed to parse snapshot: {error}"))
}

pub fn delete(id: &str) -> Result<(), String> {
    if !valid_id(id) {
        return Err("invalid snapshot id".to_owned());
    }

    delete_into(&history_dir()?, id)
}

fn delete_into(directory: &Path, id: &str) -> Result<(), String> {
    let _ = fs::remove_file(snapshot_path(directory, id));

    let _ = fs::remove_file(meta_path(directory, id));

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{delete_into, list_into, read_into, save_into, valid_id, Snapshot, MAX_SNAPSHOTS};

    use std::collections::BTreeMap;

    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_dir() -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();

        let directory = std::env::temp_dir().join(format!(
            "tint-history-test-{}-{unique}",
            std::process::id(),
        ));

        std::fs::create_dir_all(&directory).unwrap();

        directory
    }

    fn snapshot(label: &str) -> Snapshot {
        Snapshot {
            id: String::new(),
            created_at: 0,
            label: label.to_owned(),
            target: "x86_64-pc-windows-msvc".to_owned(),
            source: "integer: i64 = 1 + 2;".to_owned(),
            outputs: BTreeMap::from([("ir".to_owned(), "IR".to_owned())]),
        }
    }

    #[test]
    fn saves_lists_reads_and_deletes() {
        let directory = temp_dir();

        let saved = save_into(&directory, snapshot("first"), 1_000).unwrap();

        assert_eq!(saved.label, "first");
        assert_eq!(saved.created_at, 1_000);

        let metas = list_into(&directory).unwrap();

        assert_eq!(metas.len(), 1);

        let loaded = read_into(&directory, &saved.id).unwrap();

        assert_eq!(loaded.label, "first");
        assert_eq!(loaded.source, "integer: i64 = 1 + 2;");

        delete_into(&directory, &saved.id).unwrap();

        assert!(list_into(&directory).unwrap().is_empty());

        let _ = std::fs::remove_dir_all(&directory);
    }

    #[test]
    fn lists_newest_first() {
        let directory = temp_dir();

        save_into(&directory, snapshot("older"), 1_000).unwrap();
        save_into(&directory, snapshot("newer"), 2_000).unwrap();

        let metas = list_into(&directory).unwrap();

        assert_eq!(metas[0].label, "newer");
        assert_eq!(metas[1].label, "older");

        let _ = std::fs::remove_dir_all(&directory);
    }

    #[test]
    fn prunes_beyond_the_limit() {
        let directory = temp_dir();

        for index in 0..(MAX_SNAPSHOTS + 3) {
            save_into(&directory, snapshot(&format!("s{index}")), index as u64).unwrap();
        }

        assert_eq!(list_into(&directory).unwrap().len(), MAX_SNAPSHOTS);

        let _ = std::fs::remove_dir_all(&directory);
    }

    #[test]
    fn validates_ids() {
        assert!(valid_id("1000-1234"));

        assert!(!valid_id(""));

        assert!(!valid_id("../etc/passwd"));

        assert!(!valid_id("a/b"));

        assert!(!valid_id("a.b"));
    }
}
