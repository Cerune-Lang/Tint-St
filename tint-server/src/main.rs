use std::io::Write;

use tiny_http::Server;

fn main() {
    let token = std::env::var("TINT_SERVER_TOKEN").unwrap_or_else(|_| generate_token());

    let port = std::env::var("TINT_SERVER_PORT")
        .ok()
        .and_then(|value| value.parse::<u16>().ok())
        .unwrap_or(0);

    let address = format!("127.0.0.1:{port}");

    let server = match Server::http(&address) {
        Ok(server) => server,

        Err(error) => {
            eprintln!("failed to start Tint server on {address}: {error}");

            std::process::exit(1);
        }
    };

    println!("tint-server listening on http://{}", server.server_addr());
    println!("token: {token}");

    let _ = std::io::stdout().flush();

    tint_server::serve(server, token);
}

fn generate_token() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};

    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();

    format!("{:016x}{:08x}", nanos as u64, std::process::id())
}
