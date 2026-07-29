"""Start the local Project Sekai Chibi Studio and open it in the browser."""

from __future__ import annotations

import threading
import time
import webbrowser
from http.server import ThreadingHTTPServer

import server


HOST = "127.0.0.1"


def open_browser(port: int) -> None:
    # Start serving first, then open the exact ephemeral port chosen by Windows.
    time.sleep(0.25)
    webbrowser.open(f"http://{HOST}:{port}/")


def schedule_browser(http_server: ThreadingHTTPServer) -> None:
    port = int(http_server.server_address[1])
    threading.Thread(target=open_browser, args=(port,), daemon=True).start()


if __name__ == "__main__":
    # 8765 is reserved on this Windows installation. Port 0 lets Windows pick
    # a permitted free loopback port and prevents future fixed-port collisions.
    server.main(port=0, host=HOST, on_ready=schedule_browser)
