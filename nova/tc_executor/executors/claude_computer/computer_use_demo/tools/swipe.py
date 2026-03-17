import subprocess, pyautogui
from typing import ClassVar, Literal, Dict, Any

from anthropic.types.beta import BetaToolUnionParam

from .base import BaseAnthropicTool, ToolResult, ToolError
from utils.utils import nova_log

class SwipeTool(BaseAnthropicTool):
    """
    Tool for interacting with Android devices via ADB, including converting 
    Mac screen coordinates to Android device coordinates for touch/swipe events.
    """
    
    name: ClassVar[Literal["swipe"]] = "swipe"
    api_type: ClassVar[Literal["swipe20241022"]] = "swipe20241022"
    
    def __init__(self):
        super().__init__()
    
    async def __call__(
        self, 
        mac_x: int = None, 
        mac_y: int = None, 
        mac_x2: int = None,
        mac_y2: int = None,
        duration: int = 1000,
        **kwargs
    ) -> ToolResult:
        print('*********** Entered into Swipe Tool ************')
        try:
            real_mac_x, real_mac_y = self._convert_ass_to_real(mac_x, mac_y)
            real_mac_x2, real_mac_y2 = self._convert_ass_to_real(mac_x2, mac_y2)
            return await self._perform_swipe(real_mac_x, real_mac_y, real_mac_x2, real_mac_y2, duration)
        except Exception as e:
            return ToolResult(error=f"Android tool error: {str(e)}")
    
    async def _perform_swipe(
        self, mac_x1: int, mac_y1: int, mac_x2: int, mac_y2: int, duration: int = 500
    ) -> ToolResult:
        """Convert Mac coordinates to Android coordinates and perform a swipe."""
        try:
            print('******** enteredinto _perform_swipe fxn')
            emulator_geo = self._get_emulator_geometry()
            android_screen_size = self._get_android_screen_size()
            
            print(f'****** Emulator_geo, android_screen_size - ({emulator_geo}), ({android_screen_size})')
            if not emulator_geo or not android_screen_size:
                return ToolResult(error="Could not determine emulator geometry or Android screen size")
            
            emulator_x, emulator_y, emulator_w, emulator_h = emulator_geo
            android_screen_w, android_screen_h = android_screen_size
            
            # Convert both sets of coordinates
            adb_x1, adb_y1 = self._convert_mac_to_emulator(
                mac_x1, mac_y1,
                emulator_x, emulator_y, emulator_w, emulator_h,
                android_screen_w, android_screen_h
            )
            print(f'em_x, em_y, adb_x, adb_y:', mac_x1, mac_y1, adb_x1, adb_y1)
            
            adb_x2, adb_y2 = self._convert_mac_to_emulator(
                mac_x2, mac_y2,
                emulator_x, emulator_y, emulator_w, emulator_h,
                android_screen_w, android_screen_h
            )
            print(f'em_x2, em_y2, adb_x2, adb_y2:', mac_x2, mac_y2, adb_x2, adb_y2)
            
            # Execute the swipe command
            cmd = [
                "adb", "shell", "input", "swipe", 
                str(adb_x1), str(adb_y1), 
                str(adb_x2), str(adb_y2),
                str(duration)
            ]
            result = subprocess.check_output(cmd).decode().strip()
            print('adb command executed...')
            
            return ToolResult(
                output=(
                    f"Swipe executed from ADB coordinates ({adb_x1}, {adb_y1}) to ({adb_x2}, {adb_y2})\n"
                    f"Mac coordinates: from ({mac_x1}, {mac_y1}) to ({mac_x2}, {mac_y2})"
                )
            )
        except subprocess.CalledProcessError as e:
            return ToolResult(error=f"ADB swipe command failed: {e.stderr.decode() if e.stderr else str(e)}")
        except Exception as e:
            return ToolResult(error=f"Error during swipe operation: {str(e)}")
    
    def _get_emulator_geometry(self):
        """Get the geometry of the Android emulator window."""
        script = '''
        tell application "System Events"
            set theProcess to first process whose name is "qemu-system-aarch64"
            set biggestArea to 0
            set finalBounds to "0,0,0,0"
            repeat with win in windows of theProcess
                try
                    set winName to name of win
                    if winName starts with "Android Emulator -" then
                        set {xPos, yPos} to position of win
                        set {w, h} to size of win
                        set area to w * h
                        if area > biggestArea then
                            set biggestArea to area
                            set finalBounds to xPos & "," & yPos & "," & w & "," & h
                        end if
                    end if
                end try
            end repeat
            return finalBounds
        end tell
        '''
        try:
            result = subprocess.check_output(["osascript", "-e", script]).decode().strip()
            # Clean out any empty parts caused by extra commas
            parts = [p.strip() for p in result.split(",") if p.strip().isdigit()]
            if len(parts) != 4:
                raise ValueError(f"Expected 4 values, got: {parts}")
            x, y, w, h = map(int, parts)
            print('Emulator x, y, w, h -', x, y, w, h)
            return x, y, w, h
        except subprocess.CalledProcessError as e:
            nova_log("Could not locate emulator window.", Exception("stderr:", e.stderr.decode() if e.stderr else "No stderr available"))
            return None
        except ValueError as ve:
            nova_log("Error parsing geometry:", ve)
            return None
    
    def _get_android_screen_size(self):
        """Get the screen size of the Android device."""
        try:
            output = subprocess.check_output(["adb", "shell", "wm", "size"]).decode().strip()
            # Example output: "Physical size: 1280x2856"
            if "Physical size:" in output:
                size_str = output.split("Physical size:")[-1].strip()
                android_screen_w, android_screen_h = map(int, size_str.split("x"))
                print('android w, h -', android_screen_w, android_screen_h)
                return android_screen_w, android_screen_h
            else:
                raise ValueError(f"Unexpected output format: {output}")
        except subprocess.CalledProcessError as e:
            nova_log("Error running adb command:", e)
            return None
        except Exception as e:
            nova_log("Error parsing screen size:", e)
            return None

    def _convert_ass_to_real(self, x, y): 
        width = int(pyautogui.size()[0])
        height = int(pyautogui.size()[1])

        MAX_WIDTH = 1280  # Max screenshot width
        if width > MAX_WIDTH:
            scale_factor = MAX_WIDTH / width
            target_width = MAX_WIDTH
            target_height = int(height * scale_factor)
        else:
            scale_factor = 1.0
            target_width = width
            target_height = height

        print(f'--------- inside swipe tool - Input coords - {x}, {y}')
        x_scaling_factor = width / target_width
        y_scaling_factor = height / target_height
        print(f'-- inside swipe tool - scaled coords - ass -> real - {round(x * x_scaling_factor)}, {round(y * y_scaling_factor)}')
        return round(x * x_scaling_factor), round(y * y_scaling_factor)

    def _convert_mac_to_emulator(
        self, x_mac, y_mac, 
        emulator_x, emulator_y, emulator_w, emulator_h,
        android_screen_w, android_screen_h
    ):
        """Convert Mac screen coordinates to Android emulator coordinates."""
        # Get position relative to emulator window
        rel_x = x_mac - emulator_x
        rel_y = y_mac - emulator_y
        
        # Scale to Android device pixel dimensions
        scale_x = android_screen_w / emulator_w
        scale_y = android_screen_h / emulator_h
        
        adb_x = int(rel_x * scale_x)
        adb_y = int(rel_y * scale_y)
        
        return adb_x, adb_y
    
    def to_params(self) -> BetaToolUnionParam:
        """Return the parameters for this tool as required by the Anthropic API."""
        return {
          "name": self.name, 
          "description": "Implements swipe up/down/left/right on emulator screen. Given the coordinates in reference to the entire laptop screen, this module converts the coords into emulator referenced coords which can be consumed by the adb tool. Then the adb tool is called with adb shell input swipe command to perform the swipe on the emulator screen.",
          "input_schema": {
            "type": "object",
            "properties": {
              "mac_x": {
                "type": "integer",
                "description": "X coordinate on Mac screen (swipe start)"
              },
              "mac_y": {
                "type": "integer",
                "description": "Y coordinate on Mac screen (swipe start)"
              },
              "mac_x2": {
                "type": "integer",
                "description": "X coordinate on Mac screen for swipe end"
              },
              "mac_y2": {
                "type": "integer",
                "description": "Y coordinate on Mac screen for swipe end"
              },
              "duration": {
                "type": "integer",
                "description": "Duration of swipe in milliseconds (default: 1000)",
                "default": 1000
              }
            },
            "required": ["mac_x", "mac_y", "mac_x2", "mac_y2"]
        }
    } 
