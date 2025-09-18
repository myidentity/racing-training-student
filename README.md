# Interactive Racing Training Interface - Student Portal

This is the **student-facing** web interface for the Interactive Racing Training System.

## Access the Training System

🌐 **Live at:** [https://.github.io/](https://.github.io/)

## For Students

### Getting Started
1. Visit the main portal page
2. Choose your interface:
   - **Basic Controller**: Simple parameter controls
   - **Enhanced Controller**: Advanced features with telemetry

### Using the Interface
1. Enter your **Student ID** (provided by instructor)
2. Select your assigned **Car Number** (1-5)
3. Adjust control parameters:
   - **Kp, Ki, Kd**: PID controller gains
   - **Speed**: Target velocity
   - **Look-ahead**: Path following distance
4. Click **Submit** to sync with the simulation
5. Watch your car's performance in real-time!

## Features

- ✅ Real-time parameter synchronization
- ✅ Live telemetry feedback
- ✅ Multi-student support
- ✅ Mobile-friendly responsive design
- ✅ No installation required

## Technology Stack

- Pure HTML/CSS/JavaScript (no build required)
- Firebase Realtime Database for sync
- WebSocket connection to simulation

## Security Notice

🔒 This portal contains **student interfaces only**. The supervisor dashboard is not publicly accessible and runs on a secure, instructor-controlled system.

---

*Note: This is the web interface only. The ROS2 simulation and supervisor controls are managed separately by your instructor.*
