#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

const SERVER_URL_ENV: &str = "SHARKORD_DESKTOP_URL";

fn remote_server_url() -> Result<tauri::Url, Box<dyn std::error::Error>> {
    let raw_url = std::env::var(SERVER_URL_ENV)
        .map_err(|_| format!("{SERVER_URL_ENV} must be set to a remote Sharkord server URL"))?;
    let trimmed_url = raw_url.trim().trim_end_matches('/');

    if trimmed_url.is_empty() {
        return Err(format!("{SERVER_URL_ENV} must not be empty").into());
    }

    let url = tauri::Url::parse(trimmed_url)?;

    match url.scheme() {
        "http" | "https" => Ok(url),
        scheme => Err(format!("{SERVER_URL_ENV} must use http or https, got {scheme}").into()),
    }
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let url = remote_server_url()?;

            tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::External(url))
                .title("Sharkord")
                .inner_size(1280.0, 800.0)
                .min_inner_size(960.0, 640.0)
                .resizable(true)
                .center()
                .on_document_title_changed(|window, title| {
                    let _ = window.set_title(&title);
                })
                .build()?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Sharkord desktop smoke test");
}
