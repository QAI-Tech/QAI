#!/usr/bin/env python3
import subprocess
import sys
import os
import platform


def check_command(command, description):
    """Check if a command is available in PATH"""
    try:
        result = subprocess.run([command, "--version"], capture_output=True, text=True)
        if result.returncode == 0:
            print(f"✅ {description} is installed")
            # Show version info
            version_line = result.stdout.split("\n")[0]
            print(f"   Version: {version_line}")
            return True
        else:
            print(f"❌ {description} is not working properly")
            print(f"   Error: {result.stderr.strip()}")
            return False
    except FileNotFoundError:
        print(f"❌ {description} is not installed")
        return False


def check_ffmpeg_special():
    """Special FFmpeg check that tries multiple locations"""
    print("🔍 Checking FFmpeg (video processing)...")

    # Try different possible FFmpeg locations
    ffmpeg_paths = [
        "ffmpeg",
        "/usr/local/bin/ffmpeg",
        "/opt/homebrew/bin/ffmpeg",
        "/usr/bin/ffmpeg",
    ]

    for path in ffmpeg_paths:
        try:
            result = subprocess.run(
                [path, "-version"], capture_output=True, text=True, timeout=10
            )
            if result.returncode == 0:
                print(f"✅ FFmpeg (video processing) is installed")
                version_line = result.stdout.split("\n")[0]
                print(f"   Version: {version_line}")
                print(f"   Path: {path}")
                return True
        except (FileNotFoundError, subprocess.TimeoutExpired):
            continue
        except Exception as e:
            continue

    print("❌ FFmpeg (video processing) is not installed")
    return False


def get_install_commands():
    """Get installation commands based on the current platform"""
    system = platform.system().lower()

    if system == "darwin":  # macOS
        return {
            "adb": "brew install android-platform-tools",
            "scrcpy": "brew install scrcpy",
            "ffmpeg": "brew install ffmpeg",
        }
    elif system == "linux":
        # Try to detect the distribution
        try:
            with open("/etc/os-release", "r") as f:
                content = f.read().lower()
                if "ubuntu" in content or "debian" in content:
                    return {
                        "adb": "sudo apt update && sudo apt install android-tools-adb",
                        "scrcpy": "sudo apt update && sudo apt install scrcpy",
                        "ffmpeg": "sudo apt update && sudo apt install ffmpeg",
                    }
                elif "fedora" in content or "rhel" in content or "centos" in content:
                    return {
                        "adb": "sudo dnf install android-tools",
                        "scrcpy": "sudo dnf install scrcpy",
                        "ffmpeg": "sudo dnf install ffmpeg",
                    }
        except:
            pass
        # Default to apt for unknown Linux distributions
        return {
            "adb": "sudo apt update && sudo apt install android-tools-adb",
            "scrcpy": "sudo apt update && sudo apt install scrcpy",
            "ffmpeg": "sudo apt update && sudo apt install ffmpeg",
        }
    else:  # Windows or other
        return {
            "adb": "Download from: https://developer.android.com/studio/command-line/adb",
            "scrcpy": "Download from: https://github.com/Genymobile/scrcpy/releases",
            "ffmpeg": "Download from: https://ffmpeg.org/download.html",
        }


def check_adb_connection():
    """Check if ADB is connected to a device"""
    try:
        result = subprocess.run(["adb", "devices"], capture_output=True, text=True)
        if result.returncode == 0:
            lines = result.stdout.strip().split("\n")[1:]  # Skip header
            devices = [line for line in lines if line.strip() and "device" in line]
            if devices:
                print(f"✅ ADB connected to {len(devices)} device(s)")
                for device in devices:
                    print(f"   - {device}")
                return True
            else:
                print("❌ No Android devices connected via ADB")
                print("   Available devices:")
                for line in lines:
                    if line.strip():
                        print(f"     {line}")
                return False
    except Exception as e:
        print(f"❌ ADB connection check failed: {e}")
        return False


def main():
    print("🔍 Checking system requirements for Android emulator streaming...\n")
    print(f"Platform: {platform.system()} {platform.release()}")
    print()

    # Check required tools
    tools = [
        ("adb", "Android Debug Bridge (ADB)"),
        ("scrcpy", "Scrcpy (Android screen mirroring)"),
    ]

    missing_tools = []
    all_tools_ok = True

    # Check regular tools
    for command, description in tools:
        if not check_command(command, description):
            all_tools_ok = False
            missing_tools.append(command)
        print()

    # Special FFmpeg check
    if not check_ffmpeg_special():
        all_tools_ok = False
        missing_tools.append("ffmpeg")
    print()

    # Check ADB connection
    adb_ok = check_adb_connection()

    print("\n" + "=" * 50)
    if all_tools_ok and adb_ok:
        print("🎉 All requirements met! You can run the server.")
        print("\nTo start the server:")
        print("  python server.py")
        print("\nThen open http://localhost:8000 in your browser")
    else:
        print("⚠️  Some requirements are missing. Please install them:")

        if missing_tools:
            print("\n📦 Install missing tools:")
            install_commands = get_install_commands()

            for tool in missing_tools:
                if tool in install_commands:
                    print(f"\n  {tool.upper()}:")
                    print(f"    {install_commands[tool]}")
                else:
                    print(f"\n  {tool.upper()}: Manual installation required")

            print("\n Quick install (macOS with Homebrew):")
            if "adb" in missing_tools:
                print("  brew install android-platform-tools")
            if "scrcpy" in missing_tools:
                print("  brew install scrcpy")
            if "ffmpeg" in missing_tools:
                print("  brew install ffmpeg")
                print("  # If that doesn't work, try:")
                print("  brew uninstall ffmpeg")
                print("  brew install --build-from-source ffmpeg")

        if not adb_ok:
            print("\n📱 Connect Android device/emulator:")
            print("  1. Enable USB debugging on your Android device")
            print("     Settings > Developer options > USB debugging")
            print("  2. Connect via USB or start Android emulator")
            print("  3. Run: adb devices")
            print("  4. Accept the USB debugging prompt on your device")

    return all_tools_ok and adb_ok


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
