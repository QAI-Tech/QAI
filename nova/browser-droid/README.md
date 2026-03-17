# 🤖 Android Emulator Controller

A web-based Android device controller that allows you to control your Android device through a browser interface. This tool provides real-time screen streaming, touch input, APK installation, screen recording, and more.

## ✨ Features

### 🎯 **Enhanced Tap Detection**

- **Click-to-Tap**: Simply click anywhere on the device screen in the web interface to tap that location
- **Dynamic Resolution Detection**: Automatically detects and adapts to your device's actual screen resolution
- **Visual Feedback**: See a red circle indicator where you clicked
- **Real-time Coordinates**: Hover over the device screen to see the exact coordinates in real-time
- **Coordinate Validation**: Ensures taps are within the device's screen bounds
- **Manual Coordinate Input**: Still supports manual X/Y coordinate entry with updated placeholders

### 📱 Device Control

- **Real-time Screen Streaming**: View your device screen in the browser
- **Touch Input**: Tap, swipe, and gesture support
- **Keyboard Events**: Send key events (Back, Home, Menu, Volume, Power)
- **APK Installation**: Upload and install APK files directly
- **Screen Recording**: Record device screen and download videos
- **Screenshots**: Take and download screenshots

### 🔧 Technical Features

- **WebSocket Streaming**: Real-time video streaming via WebSocket
- **ADB Integration**: Direct Android Debug Bridge integration
- **Cross-platform**: Works on Windows, macOS, and Linux
- **Responsive UI**: Modern, responsive web interface

## 🚀 Quick Start

### Prerequisites

- Python 3.7+
- ADB (Android Debug Bridge) installed and in PATH
- Android device connected via USB with USB debugging enabled **OR** Android emulator

### Android Emulator Setup (Alternative to Physical Device)

If you don't have a physical Android device, you can use an Android emulator:

1. **Install Android Studio** (includes emulator):

   ```bash
   brew install --cask android-studio
   ```

2. **Run the setup script**:

   ```bash
   cd browser-droid
   ./setup_emulator.sh
   ```

3. **Follow the interactive setup**:

   - Choose option 1 to check requirements
   - Choose option 2 to setup environment
   - Choose option 6 to create a basic AVD (if needed)
   - Choose option 4 to start an emulator

4. **Verify connection**:
   ```bash
   adb devices
   ```
   You should see your emulator listed.

### Installation

1. **Clone the repository**:

   ```bash
   git clone <repository-url>
   cd browser-droid
   ```

2. **Install dependencies**:

   ```bash
   pip install -r requirements.txt
   ```

3. **Install adb**:

   ```bash
   pip install adb
   ```

   - If this command fails (noticed in Windows) then download official adb from [this link](https://developer.android.com/tools/releases/platform-tools) and extract the files.

   - Then add the location to path in system environment variables.

   - Restart the terminal before continuing to next steps.

4. **Connect your Android device OR start emulator**:

   **For physical device:**

   ```bash
   adb devices
   ```

   Make sure your device appears in the list.

   **For emulator:**

   ```bash
   ./setup_emulator.sh
   # Choose option 4 to start an emulator
   ```

5. **Run the server**:

   ```bash
   python server.py
   ```

6. **Open your browser** and navigate to `http://localhost:8000`

## 🎮 How to Use

### Tap Detection

1. **Automatic Resolution**: The system automatically detects your device's screen resolution
2. **Click to Tap**: Simply click anywhere on the device screen in the web interface
3. **Visual Feedback**: A red circle will appear where you clicked
4. **Coordinate Display**: Hover over the screen to see real-time coordinates
5. **Manual Input**: Use the X/Y input fields for precise coordinate entry

### Device Control

- **Tap**: Click on the device screen or use manual coordinates
- **Swipe**: Use the swipe function with start/end coordinates
- **Keys**: Use the keyboard buttons for system keys
- **APK**: Upload and install APK files
- **Recording**: Start/stop screen recording
- **Screenshots**: Take device screenshots

### Resolution Management

- **Auto-detection**: Resolution is automatically detected on startup
- **Manual Refresh**: Click "📏 Refresh Resolution" to update resolution
- **Status Display**: Current resolution is shown in the status bar
- **Coordinate Validation**: All taps are validated against current resolution

## 🔧 Configuration

### Screen Resolution

The system automatically detects your device's screen resolution. If detection fails, it defaults to 1080x1920. You can manually refresh the resolution using the "📏 Refresh Resolution" button.

### Streaming Quality

- **WebSocket Streaming**: Real-time streaming via WebSocket for low latency
- **Screenshot Mode**: Fallback to screenshot-based streaming
- **Frame Rate**: Configurable frame rate for streaming

## 🛠️ Troubleshooting

### Common Issues

1. **Device not detected**:

   - Ensure USB debugging is enabled
   - Check ADB connection: `adb devices`
   - Restart ADB server: `adb kill-server && adb start-server`

2. **Tap not working**:

   - Check device resolution detection
   - Use "📏 Refresh Resolution" button
   - Verify coordinates are within screen bounds

3. **Streaming issues**:

   - Check WebSocket connection
   - Use "🔄 Refresh Stream" button
   - Verify device is connected and responsive

4. **APK installation fails**:

   - Ensure APK file is valid
   - Check device storage space
   - Verify installation permissions

5. **Emulator issues**:
   - Use the setup script: `./setup_emulator.sh`
   - Check if emulator is running: `adb devices`
   - Restart emulator if needed
   - Ensure ANDROID_HOME is set correctly

### Debug Information

- Check the log panel at the bottom of the interface
- Look for error messages and status updates
- Use the "🔧 Test WebSocket" button to verify connections

## 📁 Project Structure

```
browser-droid/
├── server.py              # Main Flask server
├── index.html             # Web interface
├── requirements.txt       # Python dependencies
├── static/               # Static assets
│   └── js/
│       └── socket.io.js  # Socket.IO client
├── uploads/              # APK upload directory
│   └── apk/
└── downloads/            # Downloaded files
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- Android Debug Bridge (ADB) for device communication
- Flask and Socket.IO for web framework
- scrcpy for screen capture and control
