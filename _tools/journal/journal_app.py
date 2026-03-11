import webview
import pystray
from PIL import Image, ImageDraw
import threading
import keyboard
import os
import sys

# Configuration
HTML_FILE = os.path.join(os.path.dirname(__file__), 'dashboard.html')
WINDOW_TITLE = 'Terminus Daily Journal'
HOTKEY = 'alt+j'

class JournalApp:
    def __init__(self):
        self.window = None
        self.icon = None
        self.is_visible = False

    def create_window(self):
        self.window = webview.create_window(
            WINDOW_TITLE,
            HTML_FILE,
            width=600,
            height=800,
            resizable=True,
            on_top=True,
            confirm_close=False
        )
        webview.start(self.on_window_loaded, debug=True)

    def on_window_loaded(self):
        # Window is hidden initially by default if we use hidden=True in create_window
        # But pywebview doesn't support hidden=True on all platforms easily
        # So we just manage visibility manually if needed
        pass

    def toggle_window(self):
        if self.window:
            self.window.restore() if self.window.minimized else self.window.show()
            self.window.focus()

    def create_tray(self):
        # Create a simple icon
        image = Image.new('RGB', (64, 64), color=(200, 241, 53)) # --accent color
        draw = ImageDraw.Draw(image)
        draw.rectangle((16, 16, 48, 48), fill=(0, 0, 0))
        
        menu = pystray.Menu(
            pystray.MenuItem('Show Journal (Alt+J)', self.toggle_window),
            pystray.MenuItem('Exit', self.on_exit)
        )
        self.icon = pystray.Icon("Terminus", image, "Terminus Journal", menu)
        self.icon.run()

    def setup_hotkeys(self):
        keyboard.add_hotkey(HOTKEY, self.toggle_window)

    def on_exit(self, icon, item):
        self.icon.stop()
        os._exit(0)

if __name__ == '__main__':
    app = JournalApp()
    
    # Start hotkeys in a separate thread
    threading.Thread(target=app.setup_hotkeys, daemon=True).start()
    
    # Start tray icon in a separate thread
    threading.Thread(target=app.create_tray, daemon=True).start()
    
    # Main loop for WebView
    app.create_window()
