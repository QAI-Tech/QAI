import subprocess
import logging
import os
import time
from typing import Optional, List, Tuple

logger = logging.getLogger(__name__)


class ADBService:
    """Service for handling all ADB (Android Debug Bridge) operations"""

    def __init__(self, config):
        self.config = config
        self.screen_width = config.SCREEN_WIDTH
        self.screen_height = config.SCREEN_HEIGHT
        self.last_screenshot_error_time = 0
        self.screenshot_error_count = 0

    def get_screen_resolution(self) -> bool:
        """Get the actual screen resolution from the connected device"""
        try:
            result = subprocess.run(
                ["adb", "shell", "wm", "size"],
                capture_output=True,
                text=True,
                timeout=5,
            )
            if result.returncode == 0:
                output = result.stdout.strip()
                if "Physical size:" in output:
                    size = output.split("Physical size:")[-1].strip()
                    if "x" in size:
                        self.screen_width, self.screen_height = size.split("x")
                        logger.info(
                            f"Screen resolution: {self.screen_width}x{self.screen_height}"
                        )
                        return True
        except Exception as e:
            logger.error(f"Failed to get screen resolution: {e}")
        return False

    def check_adb_connection(self) -> bool:
        """Check if ADB is connected to a device"""
        try:
            result = subprocess.run(
                ["adb", "devices"], capture_output=True, text=True, timeout=5
            )
            if result.returncode == 0:
                lines = result.stdout.strip().split("\n")[1:]
                devices = [line for line in lines if line.strip() and "device" in line]
                return len(devices) > 0
        except Exception as e:
            logger.error(f"ADB connection check failed: {e}")
        return False

    def run_adb_command(self, cmd: List[str]) -> Optional[str]:
        """Run ADB command with proper error handling"""
        full_cmd = ["adb"] + cmd
        try:
            result = subprocess.run(
                full_cmd, check=True, capture_output=True, text=True, timeout=10
            )
            return result.stdout.strip()
        except subprocess.CalledProcessError as e:
            logger.error(f"ADB command failed: {e.stderr}")
            return None
        except subprocess.TimeoutExpired:
            logger.error(f"ADB command timed out: {full_cmd}")
            return None

    def take_screenshot(self) -> Optional[bytes]:
        """Take a screenshot of the device"""
        try:
            result = subprocess.run(
                ["adb", "exec-out", "screencap", "-p"], capture_output=True, timeout=10
            )
            if result.returncode == 0:
                # Reset error count on success
                if self.screenshot_error_count > 0:
                    logger.info(
                        f"Screenshot recovered after {self.screenshot_error_count} failures"
                    )
                    self.screenshot_error_count = 0
                return result.stdout
            else:
                self.screenshot_error_count += 1
                current_time = time.time()

                # Only log error every 10 seconds to prevent spam
                if current_time - self.last_screenshot_error_time > 10:
                    logger.error(
                        f"Screenshot failed with return code: {result.returncode} (failed {self.screenshot_error_count} times)"
                    )
                    self.last_screenshot_error_time = current_time

                return None
        except Exception as e:
            self.screenshot_error_count += 1
            current_time = time.time()

            # Only log error every 10 seconds to prevent spam
            if current_time - self.last_screenshot_error_time > 10:
                logger.error(
                    f"Screenshot error: {e} (failed {self.screenshot_error_count} times)"
                )
                self.last_screenshot_error_time = current_time

            return None

    def tap(self, x: int, y: int) -> bool:
        """Handle tap input"""
        output = self.run_adb_command(["shell", "input", "tap", str(x), str(y)])
        return output is not None

    def swipe(self, x1: int, y1: int, x2: int, y2: int, duration: int) -> bool:
        """Handle swipe input"""
        output = self.run_adb_command(
            [
                "shell",
                "input",
                "swipe",
                str(x1),
                str(y1),
                str(x2),
                str(y2),
                str(duration),
            ]
        )
        return output is not None

    def key_event(self, keycode: int) -> bool:
        """Handle key events"""
        output = self.run_adb_command(["shell", "input", "keyevent", str(keycode)])
        return output is not None

    def input_text(self, text: str) -> bool:
        """Send text input to device"""
        try:
            # Escape special characters for shell command
            escaped_text = text.replace("'", "'\"'\"'").replace('"', '\\"')

            # Use ADB input text command to send text to device
            result = self.run_adb_command(
                ["shell", "input", "text", f'"{escaped_text}"']
            )
            if result is not None:
                logger.info(f"Text input sent: {text}")
                return True
            else:
                logger.error("Failed to send text input")
                return False
        except Exception as e:
            logger.error(f"Text input error: {e}")
            return False

    def cut_text(self) -> bool:
        """Cut selected text on device"""
        try:
            result = self.run_adb_command(["shell", "input", "keyevent", "KEYCODE_CUT"])
            if result is not None:
                logger.info("Cut command sent")
                return True
            else:
                logger.error("Failed to cut text")
                return False
        except Exception as e:
            logger.error(f"Cut error: {e}")
            return False

    def copy_text(self) -> bool:
        """Copy selected text on device"""
        try:
            result = self.run_adb_command(
                ["shell", "input", "keyevent", "KEYCODE_COPY"]
            )
            if result is not None:
                logger.info("Copy command sent")
                return True
            else:
                logger.error("Failed to copy text")
                return False
        except Exception as e:
            logger.error(f"Copy error: {e}")
            return False

    def paste_text(self) -> bool:
        """Paste text on device"""
        try:
            result = self.run_adb_command(
                ["shell", "input", "keyevent", "KEYCODE_PASTE"]
            )
            if result is not None:
                logger.info("Paste command sent")
                return True
            else:
                logger.error("Failed to paste text")
                return False
        except Exception as e:
            logger.error(f"Paste error: {e}")
            return False

    def install_apk(self, apk_path: str) -> Optional[str]:
        """Install APK file"""
        output = self.run_adb_command(["install", apk_path])
        return output

    def get_screen_resolution_info(self) -> Tuple[str, str]:
        """Get current screen resolution values"""
        return self.screen_width, self.screen_height

    def dump_ui_hierarchy(self) -> Optional[str]:
        try:
            # Use compressed mode for faster performance
            result = subprocess.run(
                ["adb", "shell", "uiautomator", "dump", "--compressed"],
                capture_output=True,
                text=True,
                timeout=5,
            )

            if result.returncode != 0:
                logger.error(f"UI hierarchy dump failed: {result.stderr}")
                return None

            # Then, pull the XML file
            xml_result = subprocess.run(
                ["adb", "exec-out", "cat", "/sdcard/window_dump.xml"],
                capture_output=True,
                text=True,
                timeout=3,
            )

            if xml_result.returncode == 0:
                return xml_result.stdout
            else:
                logger.error(f"Failed to read UI hierarchy XML: {xml_result.stderr}")
                return None

        except subprocess.TimeoutExpired:
            logger.warning(
                "UI hierarchy dump timed out - device may be slow or UI too complex"
            )
            return None
        except Exception as e:
            logger.error(f"UI hierarchy dump error: {e}")
            return None

    def kill_all_apps_and_go_home(self) -> bool:
        """Force-stop all user apps, clear recents, and bring emulator to the default home screen (using explicit intent)"""
        try:
            # List all user-installed packages
            pkgs_output = self.run_adb_command(["shell", "pm", "list", "packages", "-3"])
            if pkgs_output:
                pkgs = [line.replace("package:", "").strip() for line in pkgs_output.splitlines() if line.strip()]
                for pkg in pkgs:
                    self.run_adb_command(["shell", "am", "force-stop", pkg])

            time.sleep(1)

            # Clear recent apps list
            self.run_adb_command(["shell", "cmd", "activity", "clear-recent-apps"])

            # Explicitly launch the default home screen
            self.run_adb_command([
                "shell", "am", "start", "-a", "android.intent.action.MAIN", "-c", "android.intent.category.HOME"
            ])

            logger.info("Force-stopped all user apps, cleared recents, and returned to default home screen (via intent)")
            return True

        except Exception as e:
            logger.error(f"Failed to force-stop all apps and go home: {e}")
            return False

