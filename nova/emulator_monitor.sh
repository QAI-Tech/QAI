#!/bin/bash

EMULATOR_PATH="$HOME/Android/Sdk/emulator/emulator"
AVD_NAME="Medium_Phone_API_36.0"
CHECK_INTERVAL=30
LOG_FILE="$HOME/emulator_monitor.log"
MAX_RESTART_ATTEMPTS=3
COOLDOWN_PERIOD=300
HEALTH_STATUS_FILE="/tmp/emulator_health_status"
BOOT_WAIT_TIME=90
UNLOCK_PIN="1234"

declare -a RESTART_TIMES=()

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

set_health_status() {
    local status="$1"
    local message="$2"
    local timestamp=$(date +%s)
    echo "{\"status\": \"$status\", \"message\": \"$message\", \"timestamp\": $timestamp}" > "$HEALTH_STATUS_FILE"
    log "Health status set to: $status - $message"
}

get_emulator_device() {
    adb devices 2>/dev/null | grep "emulator-" | head -1 | awk '{print $1}'
}

is_emulator_running() {
    if pgrep -f "qemu-system.*$AVD_NAME" > /dev/null 2>&1; then
        return 0
    fi

    if command -v adb &> /dev/null; then
        if adb devices 2>/dev/null | grep -q "emulator-"; then
            return 0
        fi
    fi

    return 1
}

is_emulator_responsive() {
    if ! command -v adb &> /dev/null; then
        return 0
    fi

    local device=$(get_emulator_device)

    if [ -z "$device" ]; then
        return 1
    fi

    if timeout 10 adb -s "$device" shell getprop sys.boot_completed 2>/dev/null | grep -q "1"; then
        return 0
    fi

    return 1
}

is_screen_locked() {
    local device=$(get_emulator_device)

    if [ -z "$device" ]; then
        return 1
    fi

    local lock_status=$(adb -s "$device" shell dumpsys window 2>/dev/null | grep -E "mDreamingLockscreen=true|mShowingLockscreen=true")

    if [ -n "$lock_status" ]; then
        return 0
    fi

    return 1
}

is_screen_off() {
    local device=$(get_emulator_device)

    if [ -z "$device" ]; then
        return 1
    fi

    local screen_state=$(adb -s "$device" shell dumpsys power 2>/dev/null | grep "mWakefulness=" | grep -i "asleep\|dozing")

    if [ -n "$screen_state" ]; then
        return 0
    fi

    return 1
}

unlock_screen() {
    local device=$(get_emulator_device)
    
    if [ -z "$device" ]; then
        log "ERROR: No emulator device found for unlock"
        return 1
    fi
    
    log "Attempting to unlock screen on device: $device"
    
    # Wake up screen
    adb -s "$device" shell input keyevent KEYCODE_WAKEUP
    sleep 1
    
    # Swipe up to reveal PIN pad
    adb -s "$device" shell input swipe 540 2000 540 500 500
    sleep 1
    
    # Enter PIN
    adb -s "$device" shell input text "$UNLOCK_PIN"
    sleep 0.5
    
    # Press Enter
    adb -s "$device" shell input keyevent 66
    sleep 2
    
    log "Unlock sequence completed"
    return 0
}

kill_zombie_emulator() {
    log "Killing any zombie emulator processes..."
    set_health_status "unhealthy" "Killing zombie processes"

    pkill -9 -f "qemu-system.*$AVD_NAME" 2>/dev/null
    pkill -9 -f "emulator.*$AVD_NAME" 2>/dev/null

    adb kill-server 2>/dev/null
    sleep 2
    adb start-server 2>/dev/null

    sleep 5
}

check_restart_limit() {
    local current_time=$(date +%s)
    local valid_times=()

    for time in "${RESTART_TIMES[@]}"; do
        if (( current_time - time < COOLDOWN_PERIOD )); then
            valid_times+=("$time")
        fi
    done

    RESTART_TIMES=("${valid_times[@]}")

    if (( ${#RESTART_TIMES[@]} >= MAX_RESTART_ATTEMPTS )); then
        return 1
    fi

    return 0
}

start_emulator() {
    log "Starting emulator: $AVD_NAME"
    set_health_status "restarting" "Starting emulator"
    
    RESTART_TIMES+=("$(date +%s)")
    
    nohup "$EMULATOR_PATH" -avd "$AVD_NAME" \
         -no-snapshot-load \
         -no-boot-anim \
         -gpu auto \
         > "$HOME/emulator_output.log" 2>&1 &

    local pid=$!

    set_health_status "booting" "Waiting for emulator to boot"

    local wait_count=0
    local max_wait=120

    while (( wait_count < max_wait )); do
        sleep 5
        wait_count=$((wait_count + 5))

        if is_emulator_responsive; then
            set_health_status "stabilizing" "Emulator booted, waiting for stabilization"
            sleep "$BOOT_WAIT_TIME"
            set_health_status "healthy" "Emulator is ready"
            sleep 3
	    log "Attempting to Unloclk"
	    unlock_screen
	    return 0
        fi

        if ! kill -0 "$pid" 2>/dev/null; then
            set_health_status "unhealthy" "Emulator process died during boot"
            return 1
        fi
    done

    set_health_status "unhealthy" "Boot verification timed out"
    return 1
}

cleanup() {
    set_health_status "stopped" "Monitor script stopped"
    exit 0
}

trap cleanup SIGINT SIGTERM

set_health_status "initializing" "Monitor starting"

if ! is_emulator_running; then
    start_emulator
else
    if is_emulator_responsive; then
        unlock_screen
        set_health_status "healthy" "Emulator already running and responsive"
    else
        set_health_status "unhealthy" "Emulator running but not responsive"
    fi
fi

while true; do
    sleep "$CHECK_INTERVAL"

    if is_emulator_running; then
        if is_emulator_responsive; then
            current_status=$(cat "$HEALTH_STATUS_FILE" 2>/dev/null | grep -o '"status": "[^"]*"' | cut -d'"' -f4)
            if [ "$current_status" != "healthy" ]; then
                set_health_status "healthy" "Emulator is running and responsive"
            fi
        else
            set_health_status "unhealthy" "Emulator not responsive"
            sleep "$CHECK_INTERVAL"

            if ! is_emulator_responsive; then
                kill_zombie_emulator

                if check_restart_limit; then
                    start_emulator
                else
                    set_health_status "critical" "Too many restart attempts, in cooldown"
                    sleep "$COOLDOWN_PERIOD"
                    RESTART_TIMES=()
                    start_emulator
                fi
            fi
        fi
    else
        set_health_status "unhealthy" "Emulator crash detected"
        kill_zombie_emulator

        if check_restart_limit; then
            start_emulator
        else
            set_health_status "critical" "Too many restart attempts, in cooldown"
            sleep "$COOLDOWN_PERIOD"
            RESTART_TIMES=()
            start_emulator
        fi
    fi
done
