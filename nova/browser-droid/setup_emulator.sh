#!/bin/bash

# Android Emulator Setup Script for browser-droid
# This script helps set up and manage Android emulators for the browser-droid project

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Android Studio is installed
check_android_studio() {
    if [ ! -d "/Applications/Android Studio.app" ]; then
        print_error "Android Studio not found. Please install it first:"
        print_status "brew install --cask android-studio"
        exit 1
    fi
    print_success "Android Studio is installed"
}

# Set up Android SDK environment variables
setup_environment() {
    print_status "Setting up Android SDK environment variables..."
    
    # Try to find Android SDK path
    ANDROID_SDK_PATHS=(
        "$HOME/Library/Android/sdk"
        "$HOME/Android/Sdk"
        "/opt/homebrew/share/android-commandlinetools"
    )
    
    ANDROID_HOME=""
    for path in "${ANDROID_SDK_PATHS[@]}"; do
        if [ -d "$path" ]; then
            ANDROID_HOME="$path"
            break
        fi
    done
    
    if [ -z "$ANDROID_HOME" ]; then
        print_warning "Android SDK not found. Please set up Android Studio first."
        print_status "1. Open Android Studio"
        print_status "2. Follow the setup wizard"
        print_status "3. Install Android SDK"
        print_status "4. Run this script again"
        return 1
    fi
    
    # Set environment variables for current session
    export ANDROID_HOME="$ANDROID_HOME"
    export PATH="$PATH:$ANDROID_HOME/emulator:$ANDROID_HOME/tools:$ANDROID_HOME/tools/bin:$ANDROID_HOME/platform-tools"
    
    print_success "ANDROID_HOME set to: $ANDROID_HOME"
    print_success "Environment variables loaded for current session"
    
    # Add to shell profile for future sessions
    SHELL_PROFILE=""
    if [ -n "$ZSH_VERSION" ]; then
        SHELL_PROFILE="$HOME/.zshrc"
    elif [ -n "$BASH_VERSION" ]; then
        SHELL_PROFILE="$HOME/.bash_profile"
    fi
    
    if [ -n "$SHELL_PROFILE" ]; then
        if ! grep -q "ANDROID_HOME" "$SHELL_PROFILE" 2>/dev/null; then
            echo "" >> "$SHELL_PROFILE"
            echo "# Android SDK" >> "$SHELL_PROFILE"
            echo "export ANDROID_HOME=\"$ANDROID_HOME\"" >> "$SHELL_PROFILE"
            echo "export PATH=\"\$PATH:\$ANDROID_HOME/emulator:\$ANDROID_HOME/tools:\$ANDROID_HOME/tools/bin:\$ANDROID_HOME/platform-tools\"" >> "$SHELL_PROFILE"
            print_success "Added Android SDK to $SHELL_PROFILE"
        else
            print_status "Android SDK already configured in $SHELL_PROFILE"
        fi
    fi
    
    # Verify the setup
    if command -v emulator >/dev/null 2>&1; then
        print_success "Emulator command is now available"
    else
        print_warning "Emulator command not found. Please restart your terminal or run: source $SHELL_PROFILE"
    fi
    
    if command -v adb >/dev/null 2>&1; then
        print_success "ADB command is now available"
    else
        print_warning "ADB command not found. Please restart your terminal or run: source $SHELL_PROFILE"
    fi
}

# List available emulators
list_emulators() {
    print_status "Available emulators:"
    if command -v emulator >/dev/null 2>&1; then
        emulator -list-avds 2>/dev/null || print_warning "No emulators found. Create one using Android Studio AVD Manager."
    else
        print_warning "Emulator command not found. Setting up environment..."
        setup_environment
        if command -v emulator >/dev/null 2>&1; then
            emulator -list-avds 2>/dev/null || print_warning "No emulators found. Create one using Android Studio AVD Manager."
        else
            print_error "Failed to set up Android SDK environment"
        fi
    fi
}

# Start an emulator
start_emulator() {
    local emulator_name="$1"
    
    # Ensure environment is set up
    if ! command -v emulator >/dev/null 2>&1; then
        print_warning "Emulator command not found. Setting up environment..."
        setup_environment
        if ! command -v emulator >/dev/null 2>&1; then
            print_error "Failed to set up Android SDK environment"
            return 1
        fi
    fi
    
    if [ -z "$emulator_name" ]; then
        print_status "Available emulators:"
        list_emulators
        read -p "Enter emulator name to start: " emulator_name
    fi
    
    if [ -n "$emulator_name" ]; then
        print_status "Starting emulator: $emulator_name"
        emulator -avd "$emulator_name" -no-snapshot-load &
        
        # Wait for emulator to start
        print_status "Waiting for emulator to start..."
        adb wait-for-device
        sleep 5
        
        # Check if device is ready
        if adb devices | grep -q "device$"; then
            print_success "Emulator is ready!"
            print_status "You can now run: python server.py"
        else
            print_error "Emulator failed to start properly"
        fi
    fi
}

# Stop all emulators
stop_emulators() {
    print_status "Stopping all emulators..."
    adb devices | grep emulator | cut -f1 | while read line; do
        adb -s "$line" emu kill
    done
    print_success "All emulators stopped"
}

# Check system requirements
check_requirements() {
    print_status "Checking system requirements..."
    
    # Check ADB
    if command -v adb >/dev/null 2>&1; then
        print_success "ADB is installed"
    else
        print_error "ADB is not installed. Install with: brew install android-platform-tools"
        exit 1
    fi
    
    # Check scrcpy
    if command -v scrcpy >/dev/null 2>&1; then
        print_success "scrcpy is installed"
    else
        print_warning "scrcpy is not installed. Install with: brew install scrcpy"
    fi
    
    # Check Python
    if command -v python3 >/dev/null 2>&1; then
        print_success "Python 3 is installed"
    else
        print_error "Python 3 is not installed"
        exit 1
    fi
}

# Create a basic AVD if none exists
create_basic_avd() {
    print_status "Creating a basic Android emulator..."
    
    # Check if avdmanager is available
    if ! command -v avdmanager >/dev/null 2>&1; then
        print_error "avdmanager not found. Please set up Android SDK first."
        return 1
    fi
    
    # List installed system images
    print_status "Checking for available system images..."
    if ! avdmanager list target | grep -q "android-"; then
        print_warning "No system images found. Please install a system image first:"
        print_status "1. Open Android Studio"
        print_status "2. Go to Tools > SDK Manager"
        print_status "3. Install a system image (e.g., Android 13)"
        return 1
    fi
    
    # Create AVD
    AVD_NAME="browser_droid_emulator"
    if ! avdmanager list avd | grep -q "$AVD_NAME"; then
        print_status "Creating AVD: $AVD_NAME"
        echo "no" | avdmanager create avd -n "$AVD_NAME" -k "system-images;android-33;google_apis;arm64-v8a" --force
        print_success "AVD created: $AVD_NAME"
    else
        print_status "AVD already exists: $AVD_NAME"
    fi
}

# Main menu
show_menu() {
    echo ""
    echo "🤖 Android Emulator Setup for browser-droid"
    echo "=============================================="
    echo "1. Check requirements"
    echo "2. Setup environment"
    echo "3. List emulators"
    echo "4. Start emulator"
    echo "5. Stop all emulators"
    echo "6. Create basic AVD"
    echo "7. Test ADB connection"
    echo "8. Exit"
    echo ""
}

# Test ADB connection
test_adb() {
    print_status "Testing ADB connection..."
    adb devices
    
    if adb devices | grep -q "device$"; then
        print_success "ADB is connected to device(s)"
    else
        print_warning "No devices connected. Start an emulator or connect a physical device."
    fi
}

# Main function
main() {
    if [ "$#" -eq 0 ]; then
        # Interactive mode
        while true; do
            show_menu
            read -p "Choose an option (1-8): " choice
            
            case $choice in
                1) check_requirements ;;
                2) setup_environment ;;
                3) list_emulators ;;
                4) start_emulator ;;
                5) stop_emulators ;;
                6) create_basic_avd ;;
                7) test_adb ;;
                8) print_status "Goodbye!"; exit 0 ;;
                *) print_error "Invalid option. Please choose 1-8." ;;
            esac
            
            echo ""
            read -p "Press Enter to continue..."
        done
    else
        # Command line mode
        case "$1" in
            "check") check_requirements ;;
            "setup") setup_environment ;;
            "list") list_emulators ;;
            "start") start_emulator "$2" ;;
            "stop") stop_emulators ;;
            "create") create_basic_avd ;;
            "test") test_adb ;;
            *) 
                echo "Usage: $0 [check|setup|list|start|stop|create|test]"
                echo "Or run without arguments for interactive mode"
                exit 1
                ;;
        esac
    fi
}

# Run main function
main "$@"
