//! Playground 用のローカル HTTP バックエンドです。
//!
//! `tint-core` の観測ロジックをそのまま呼び出し、ブラウザから利用できる
//! JSON API として公開します。127.0.0.1 のみに待ち受け、`Bearer` トークンで
//! 認証します。リクエストの解釈と応答生成は [`handle_request`] に集約しており、
//! ソケットを使わずに単体テストできます。

use serde::{Deserialize, Serialize};
use tiny_http::{Header, Request, Response as HttpResponse, Server};

use tint_core::cerune_cli;
use tint_core::history;
use tint_core::interface::{
    parse_heap_limit, CheckRequest, CompareKind, CompareRequest, ExecuteRequest, ExecutionPath,
    ModulesRequest, ObserveRequest, Target,
};

/// JSON で表現したバックエンドの機能フラグです。
pub const CAPABILITIES_JSON: &str = "{\"check\":true,\"observe\":true,\"execute\":true,\
\"compare\":true,\"modules\":true,\"snapshots\":true,\"rename\":true}";

/// バックエンド非依存の応答です。
pub struct RouteResponse {
    pub status: u16,
    pub content_type: &'static str,
    pub body: String,
}

impl RouteResponse {
    fn json(status: u16, body: String) -> Self {
        Self {
            status,
            content_type: "application/json",
            body,
        }
    }

    fn serialized<T: Serialize>(value: &T) -> Self {
        match serde_json::to_string(value) {
            Ok(body) => Self::json(200, body),
            Err(error) => Self::error(500, &format!("failed to serialize response: {error}")),
        }
    }

    fn error(status: u16, message: &str) -> Self {
        let body = serde_json::json!({ "error": message }).to_string();

        Self::json(status, body)
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CheckBody {
    source: String,

    #[serde(default)]
    source_path: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ObserveBody {
    source: String,

    #[serde(default)]
    source_path: Option<String>,

    target: String,

    #[serde(default)]
    annotate_origins: bool,

    #[serde(default)]
    native_ssa: bool,

    #[serde(default)]
    string_heap_limit: Option<String>,

    #[serde(default)]
    array_heap_limit: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExecuteBody {
    source: String,

    #[serde(default)]
    source_path: Option<String>,

    path: String,

    #[serde(default)]
    string_heap_limit: Option<String>,

    #[serde(default)]
    array_heap_limit: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CompareBody {
    source: String,

    #[serde(default)]
    source_path: Option<String>,

    kind: String,

    #[serde(default)]
    annotate_origins: bool,

    #[serde(default)]
    native_ssa: bool,

    #[serde(default)]
    string_heap_limit: Option<String>,

    #[serde(default)]
    array_heap_limit: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ModulesBody {
    source: String,

    #[serde(default)]
    source_path: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct DiffBody {
    left: String,

    right: String,

    left_label: String,

    right_label: String,
}

#[derive(Serialize)]
struct DiffResult {
    diff: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RenameBody {
    path: String,

    new_name: String,
}

#[derive(Serialize)]
struct RenameResult {
    path: String,
}

fn authorized(authorization: Option<&str>, token: &str) -> bool {
    match authorization {
        Some(value) => value
            .strip_prefix("Bearer ")
            .map(|candidate| candidate == token)
            .unwrap_or(false),

        None => false,
    }
}

/// HTTP リクエストをバックエンド呼び出しへ振り分けます。
pub fn handle_request(
    method: &str,
    path: &str,
    authorization: Option<&str>,
    body: &str,
    token: &str,
) -> RouteResponse {
    if method == "GET" && path == "/health" {
        return RouteResponse::json(200, "{\"status\":\"ok\"}".to_owned());
    }

    if !authorized(authorization, token) {
        return RouteResponse::error(401, "unauthorized");
    }

    match (method, path) {
        ("GET", "/capabilities") => RouteResponse::json(200, CAPABILITIES_JSON.to_owned()),

        ("POST", "/check") => check(body),

        ("POST", "/observe") => observe(body),

        ("POST", "/execute") => execute(body),

        ("POST", "/compare") => compare(body),

        ("POST", "/modules") => modules(body),

        ("POST", "/diff") => diff(body),

        ("POST", "/snapshots") => save_snapshot(body),

        ("GET", "/snapshots") => list_snapshots(),

        ("POST", "/rename") => rename(body),

        ("GET", path) if is_snapshot_item(path) => read_snapshot(snapshot_id(path)),

        ("DELETE", path) if is_snapshot_item(path) => delete_snapshot(snapshot_id(path)),

        _ => RouteResponse::error(404, "not found"),
    }
}

fn is_snapshot_item(path: &str) -> bool {
    path.strip_prefix("/snapshots/")
        .map(|id| !id.is_empty())
        .unwrap_or(false)
}

fn snapshot_id(path: &str) -> &str {
    path.strip_prefix("/snapshots/").unwrap_or("")
}

fn parse_body<T: for<'a> Deserialize<'a>>(body: &str) -> Result<T, RouteResponse> {
    serde_json::from_str(body).map_err(|error| {
        RouteResponse::error(400, &format!("invalid request body: {error}"))
    })
}

fn check(body: &str) -> RouteResponse {
    let parsed: CheckBody = match parse_body(body) {
        Ok(value) => value,

        Err(response) => return response,
    };

    let request = CheckRequest {
        source: parsed.source,
        source_path: parsed.source_path,
    };

    match cerune_cli::check_diagnostics(request) {
        Ok(diagnostics) => RouteResponse::serialized(&diagnostics),

        Err(error) => RouteResponse::error(500, &error),
    }
}

fn observe(body: &str) -> RouteResponse {
    let parsed: ObserveBody = match parse_body(body) {
        Ok(value) => value,

        Err(response) => return response,
    };

    let target = match Target::parse(&parsed.target) {
        Ok(value) => value,

        Err(error) => return RouteResponse::error(400, &error),
    };

    let string_heap_limit =
        match parse_heap_limit(parsed.string_heap_limit, "--string-heap-limit") {
            Ok(value) => value,

            Err(error) => return RouteResponse::error(400, &error),
        };

    let array_heap_limit = match parse_heap_limit(parsed.array_heap_limit, "--array-heap-limit") {
        Ok(value) => value,

        Err(error) => return RouteResponse::error(400, &error),
    };

    let request = ObserveRequest {
        source: parsed.source,
        source_path: parsed.source_path,
        target,
        annotate_origins: parsed.annotate_origins,
        native_ssa: parsed.native_ssa,
        string_heap_limit,
        array_heap_limit,
    };

    match cerune_cli::observe(request) {
        Ok(observation) => RouteResponse::serialized(&observation),

        Err(error) => RouteResponse::error(500, &error),
    }
}

fn execute(body: &str) -> RouteResponse {
    let parsed: ExecuteBody = match parse_body(body) {
        Ok(value) => value,

        Err(response) => return response,
    };

    let execution_path = match ExecutionPath::parse(&parsed.path) {
        Ok(value) => value,

        Err(error) => return RouteResponse::error(400, &error),
    };

    let string_heap_limit =
        match parse_heap_limit(parsed.string_heap_limit, "--string-heap-limit") {
            Ok(value) => value,

            Err(error) => return RouteResponse::error(400, &error),
        };

    let array_heap_limit = match parse_heap_limit(parsed.array_heap_limit, "--array-heap-limit") {
        Ok(value) => value,

        Err(error) => return RouteResponse::error(400, &error),
    };

    let request = ExecuteRequest {
        source: parsed.source,
        source_path: parsed.source_path,
        path: execution_path,
        string_heap_limit,
        array_heap_limit,
    };

    match cerune_cli::execute(request) {
        Ok(result) => RouteResponse::serialized(&result),

        Err(error) => RouteResponse::error(500, &error),
    }
}

fn compare(body: &str) -> RouteResponse {
    let parsed: CompareBody = match parse_body(body) {
        Ok(value) => value,

        Err(response) => return response,
    };

    let kind = match CompareKind::parse(&parsed.kind) {
        Ok(value) => value,

        Err(error) => return RouteResponse::error(400, &error),
    };

    let string_heap_limit =
        match parse_heap_limit(parsed.string_heap_limit, "--string-heap-limit") {
            Ok(value) => value,

            Err(error) => return RouteResponse::error(400, &error),
        };

    let array_heap_limit = match parse_heap_limit(parsed.array_heap_limit, "--array-heap-limit") {
        Ok(value) => value,

        Err(error) => return RouteResponse::error(400, &error),
    };

    let request = CompareRequest {
        source: parsed.source,
        source_path: parsed.source_path,
        kind,
        annotate_origins: parsed.annotate_origins,
        native_ssa: parsed.native_ssa,
        string_heap_limit,
        array_heap_limit,
    };

    match cerune_cli::compare(request) {
        Ok(diff) => RouteResponse::serialized(&DiffResult { diff }),

        Err(error) => RouteResponse::error(500, &error),
    }
}

fn modules(body: &str) -> RouteResponse {
    let parsed: ModulesBody = match parse_body(body) {
        Ok(value) => value,

        Err(response) => return response,
    };

    let request = ModulesRequest {
        source: parsed.source,
        source_path: parsed.source_path,
    };

    match cerune_cli::load_modules(request) {
        Ok(files) => RouteResponse::serialized(&files),

        Err(error) => RouteResponse::error(500, &error),
    }
}

fn diff(body: &str) -> RouteResponse {
    let parsed: DiffBody = match parse_body(body) {
        Ok(value) => value,

        Err(response) => return response,
    };

    let diff = cerune_cli::diff_lines(
        &parsed.left,
        &parsed.right,
        &parsed.left_label,
        &parsed.right_label,
    );

    RouteResponse::serialized(&DiffResult { diff })
}

fn save_snapshot(body: &str) -> RouteResponse {
    let snapshot: history::Snapshot = match parse_body(body) {
        Ok(value) => value,

        Err(response) => return response,
    };

    match history::save(snapshot) {
        Ok(meta) => RouteResponse::serialized(&meta),

        Err(error) => RouteResponse::error(500, &error),
    }
}

fn list_snapshots() -> RouteResponse {
    match history::list() {
        Ok(metas) => RouteResponse::serialized(&metas),

        Err(error) => RouteResponse::error(500, &error),
    }
}

fn read_snapshot(id: &str) -> RouteResponse {
    match history::read(id) {
        Ok(snapshot) => RouteResponse::serialized(&snapshot),

        Err(error) => RouteResponse::error(404, &error),
    }
}

fn delete_snapshot(id: &str) -> RouteResponse {
    match history::delete(id) {
        Ok(()) => RouteResponse::json(200, "null".to_owned()),

        Err(error) => RouteResponse::error(404, &error),
    }
}

fn rename(body: &str) -> RouteResponse {
    let parsed: RenameBody = match parse_body(body) {
        Ok(value) => value,

        Err(response) => return response,
    };

    match tint_core::source::rename_source(&parsed.path, &parsed.new_name) {
        Ok(path) => RouteResponse::serialized(&RenameResult { path }),

        Err(error) => RouteResponse::error(400, &error),
    }
}

/// `tiny_http` のサーバーを回し続けます。`main` と統合テストの双方から使います。
pub fn serve(server: Server, token: String) {
    for mut request in server.incoming_requests() {
        let response = respond_one(&mut request, &token);

        let _ = request.respond(response);
    }
}

fn respond_one(request: &mut Request, token: &str) -> HttpResponse<std::io::Cursor<Vec<u8>>> {
    let method = request.method().as_str().to_owned();

    let path = request
        .url()
        .split(|character| character == '?' || character == '#')
        .next()
        .unwrap_or("")
        .to_owned();

    let authorization = request
        .headers()
        .iter()
        .find(|header| header.field.equiv("Authorization"))
        .map(|header| header.value.as_str().to_owned());

    let mut body = String::new();

    let _ = request.as_reader().read_to_string(&mut body);

    let route = handle_request(&method, &path, authorization.as_deref(), &body, token);

    let header = Header::from_bytes(&b"Content-Type"[..], route.content_type.as_bytes())
        .expect("static content type header");

    HttpResponse::from_string(route.body)
        .with_status_code(route.status)
        .with_header(header)
}

#[cfg(test)]
mod tests {
    use super::{handle_request, CAPABILITIES_JSON};

    const TOKEN: &str = "secret";

    fn auth() -> Option<&'static str> {
        Some("Bearer secret")
    }

    #[test]
    fn health_is_public() {
        let response = handle_request("GET", "/health", None, "", TOKEN);

        assert_eq!(response.status, 200);

        assert!(response.body.contains("ok"));
    }

    #[test]
    fn capabilities_require_a_token() {
        let missing = handle_request("GET", "/capabilities", None, "", TOKEN);

        assert_eq!(missing.status, 401);

        let wrong = handle_request("GET", "/capabilities", Some("Bearer nope"), "", TOKEN);

        assert_eq!(wrong.status, 401);

        let ok = handle_request("GET", "/capabilities", auth(), "", TOKEN);

        assert_eq!(ok.status, 200);

        assert_eq!(ok.body, CAPABILITIES_JSON);
    }

    #[test]
    fn unknown_routes_return_not_found() {
        let response = handle_request("GET", "/nope", auth(), "", TOKEN);

        assert_eq!(response.status, 404);
    }

    #[test]
    fn check_rejects_invalid_json() {
        let response = handle_request("POST", "/check", auth(), "{", TOKEN);

        assert_eq!(response.status, 400);
    }

    #[test]
    fn diff_returns_a_json_object() {
        let body = "{\"left\":\"a\\nb\",\"right\":\"a\\nc\",\"leftLabel\":\"L\",\"rightLabel\":\"R\"}";

        let response = handle_request("POST", "/diff", auth(), body, TOKEN);

        assert_eq!(response.status, 200);

        assert!(response.body.contains("\"diff\""));
    }
}
