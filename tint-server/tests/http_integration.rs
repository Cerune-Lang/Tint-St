//! 実際にソケットを開いて `tint-server` の HTTP 層を検証します。
//!
//! `cerune` に依存しない範囲（認証・ルーティング・機能フラグ・JSON 検証）だけを
//! 対象にします。Cerune 本体との連携は `tint-core` 側の統合テストで扱います。

use std::io::{Read, Write};
use std::net::TcpStream;
use std::thread;

use tiny_http::Server;

const TOKEN: &str = "integration-token";

fn start_server() -> String {
    let server = Server::http("127.0.0.1:0").expect("bind ephemeral port");

    let base_url = format!("http://{}", server.server_addr());

    let token = TOKEN.to_owned();

    thread::spawn(move || tint_server::serve(server, token));

    base_url
}

struct HttpResult {
    status: u16,
    body: String,
    raw: String,
}

fn request(
    base_url: &str,
    method: &str,
    path: &str,
    token: Option<&str>,
    body: &str,
) -> HttpResult {
    request_with_origin(base_url, method, path, token, None, body)
}

fn request_with_origin(
    base_url: &str,
    method: &str,
    path: &str,
    token: Option<&str>,
    origin: Option<&str>,
    body: &str,
) -> HttpResult {
    let host = base_url
        .strip_prefix("http://")
        .expect("base url should be http");

    let mut stream = TcpStream::connect(host).expect("connect to the server");

    let authorization = token
        .map(|value| format!("Authorization: Bearer {value}\r\n"))
        .unwrap_or_default();

    let origin_header = origin
        .map(|value| format!("Origin: {value}\r\n"))
        .unwrap_or_default();

    let payload = format!(
        "{method} {path} HTTP/1.1\r\n\
         Host: {host}\r\n\
         Content-Type: application/json\r\n\
         Content-Length: {length}\r\n\
         {authorization}\
         {origin_header}\
         Connection: close\r\n\
         \r\n\
         {body}",
        length = body.len(),
    );

    stream
        .write_all(payload.as_bytes())
        .expect("write request");

    let mut raw = String::new();

    stream.read_to_string(&mut raw).expect("read response");

    let (head, body) = raw.split_once("\r\n\r\n").unwrap_or((raw.as_str(), ""));

    let status = head
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .and_then(|code| code.parse::<u16>().ok())
        .unwrap_or(0);

    HttpResult {
        status,
        body: body.to_owned(),
        raw,
    }
}

#[test]
fn health_is_available_without_a_token() {
    let base_url = start_server();

    let response = request(&base_url, "GET", "/health", None, "");

    assert_eq!(response.status, 200);

    assert!(response.body.contains("ok"));
}

#[test]
fn protected_routes_reject_missing_tokens() {
    let base_url = start_server();

    let response = request(&base_url, "GET", "/capabilities", None, "");

    assert_eq!(response.status, 401);
}

#[test]
fn capabilities_describe_the_browser_backend() {
    let base_url = start_server();

    let response = request(&base_url, "GET", "/capabilities", Some(TOKEN), "");

    assert_eq!(response.status, 200);

    assert!(response.body.contains("\"observe\":true"));

    assert!(response.body.contains("\"compare\":true"));
}

#[test]
fn unknown_routes_return_not_found() {
    let base_url = start_server();

    let response = request(&base_url, "GET", "/does-not-exist", Some(TOKEN), "");

    assert_eq!(response.status, 404);
}

#[test]
fn invalid_json_is_rejected() {
    let base_url = start_server();

    let response = request(&base_url, "POST", "/check", Some(TOKEN), "{not json");

    assert_eq!(response.status, 400);
}

#[test]
fn diff_is_computed_locally() {
    let base_url = start_server();

    let body = "{\"left\":\"a\\nb\\n\",\"right\":\"a\\nc\\n\",\"leftLabel\":\"A\",\"rightLabel\":\"B\"}";

    let response = request(&base_url, "POST", "/diff", Some(TOKEN), body);

    assert_eq!(response.status, 200);

    assert!(response.body.contains("\"diff\""));
}

#[test]
fn spawn_starts_a_reachable_server() {
    let base_url = tint_server::spawn(TOKEN.to_owned()).expect("spawn server");

    assert!(base_url.starts_with("http://127.0.0.1:"));

    let response = request(&base_url, "GET", "/health", None, "");

    assert_eq!(response.status, 200);
}

#[test]
fn loopback_origins_receive_cors_headers() {
    let base_url = start_server();

    let response = request_with_origin(
        &base_url,
        "GET",
        "/capabilities",
        Some(TOKEN),
        Some("http://localhost:4173"),
        "",
    );

    assert_eq!(response.status, 200);

    assert!(response
        .raw
        .to_lowercase()
        .contains("access-control-allow-origin: http://localhost:4173"));
}

#[test]
fn non_loopback_origins_receive_no_cors_headers() {
    let base_url = start_server();

    let response = request_with_origin(
        &base_url,
        "GET",
        "/capabilities",
        Some(TOKEN),
        Some("http://example.com"),
        "",
    );

    assert_eq!(response.status, 200);

    assert!(!response
        .raw
        .to_lowercase()
        .contains("access-control-allow-origin"));
}

#[test]
fn preflight_requests_are_accepted() {
    let base_url = start_server();

    let response = request_with_origin(
        &base_url,
        "OPTIONS",
        "/observe",
        None,
        Some("http://127.0.0.1:5000"),
        "",
    );

    assert_eq!(response.status, 204);

    assert!(response
        .raw
        .to_lowercase()
        .contains("access-control-allow-headers"));
}
