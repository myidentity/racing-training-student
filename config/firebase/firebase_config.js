/**
 * Firebase Configuration for Interactive Racing Training
 * 
 * This file contains the Firebase configuration and helper functions
 * for real-time synchronization between student interfaces and supervisor dashboard
 */

// Firebase configuration object (replace with your actual config)
const firebaseConfig = {
    apiKey: "AIzaSyCw64QE6lr5u31cvmy4KWggsA7rUnougPU",
    authDomain: "training-after-winning.firebaseapp.com",
    databaseURL: "https://training-after-winning-default-rtdb.firebaseio.com",
    projectId: "training-after-winning",
    storageBucket: "training-after-winning.firebasestorage.app",
    messagingSenderId: "907533494916",
    appId: "1:907533494916:web:28aa94a88bf0a52885f0d1"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Get a reference to the database
const database = firebase.database();

/**
 * Firebase Database Structure:
 * 
 * racing_training/
 * ├── sessions/
 * │   └── {sessionId}/
 * │       ├── metadata/
 * │       │   ├── created: timestamp
 * │       │   ├── instructor: string
 * │       │   └── status: 'waiting' | 'active' | 'completed'
 * │       ├── students/
 * │       │   └── {studentId}/
 * │       │       ├── name: string
 * │       │       ├── carNumber: number
 * │       │       ├── connected: boolean
 * │       │       ├── parameters/
 * │       │       │   ├── kp: number
 * │       │       │   ├── ki: number
 * │       │       │   ├── kd: number
 * │       │       │   ├── speed: number
 * │       │       │   └── algorithm: string
 * │       │       ├── locked: boolean
 * │       │       └── lastUpdate: timestamp
 * │       ├── telemetry/
 * │       │   └── {carNumber}/
 * │       │       ├── position: {x, y}
 * │       │       ├── speed: number
 * │       │       ├── lapCount: number
 * │       │       └── lastUpdate: timestamp
 * │       └── commands/
 * │           ├── raceStatus: 'stopped' | 'running' | 'paused'
 * │           └── globalLock: boolean
 */

class FirebaseManager {
    constructor(sessionId = null) {
        this.sessionId = sessionId || this.generateSessionId();
        this.sessionRef = database.ref(`racing_training/sessions/${this.sessionId}`);
        this.listeners = {};
    }

    // Generate unique session ID
    generateSessionId() {
        return `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }

    // Initialize a new session
    async initializeSession(instructorName = 'Instructor') {
        const metadata = {
            created: firebase.database.ServerValue.TIMESTAMP,
            instructor: instructorName,
            status: 'waiting'
        };

        await this.sessionRef.child('metadata').set(metadata);
        await this.sessionRef.child('commands').set({
            raceStatus: 'stopped',
            globalLock: false
        });

        console.log(`Session initialized: ${this.sessionId}`);
        return this.sessionId;
    }

    // Student Functions
    async registerStudent(studentId, studentName, carNumber) {
        const studentData = {
            name: studentName,
            carNumber: carNumber,
            connected: true,
            parameters: {
                kp: 1.0,
                ki: 0.0,
                kd: 0.0,
                speed: 2.0,
                algorithm: 'pure_pursuit'
            },
            locked: false,
            lastUpdate: firebase.database.ServerValue.TIMESTAMP
        };

        await this.sessionRef.child(`students/${studentId}`).set(studentData);
        
        // Set up disconnect handler
        this.sessionRef.child(`students/${studentId}/connected`).onDisconnect().set(false);
        
        return studentData;
    }

    async updateStudentParameters(studentId, parameters) {
        const updates = {
            [`students/${studentId}/parameters`]: parameters,
            [`students/${studentId}/lastUpdate`]: firebase.database.ServerValue.TIMESTAMP
        };

        await this.sessionRef.update(updates);
    }

    // Supervisor Functions
    async lockStudentParameters(studentId, locked = true) {
        await this.sessionRef.child(`students/${studentId}/locked`).set(locked);
    }

    async setGlobalLock(locked = true) {
        await this.sessionRef.child('commands/globalLock').set(locked);
        
        // Apply to all students
        const studentsSnapshot = await this.sessionRef.child('students').once('value');
        const students = studentsSnapshot.val() || {};
        
        const updates = {};
        Object.keys(students).forEach(studentId => {
            updates[`students/${studentId}/locked`] = locked;
        });
        
        if (Object.keys(updates).length > 0) {
            await this.sessionRef.update(updates);
        }
    }

    async setRaceStatus(status) {
        // status: 'stopped' | 'running' | 'paused'
        await this.sessionRef.child('commands/raceStatus').set(status);
    }

    // Telemetry Functions
    async updateCarTelemetry(carNumber, telemetryData) {
        const data = {
            ...telemetryData,
            lastUpdate: firebase.database.ServerValue.TIMESTAMP
        };

        await this.sessionRef.child(`telemetry/${carNumber}`).update(data);
    }

    // Real-time Listeners
    onStudentChange(callback) {
        const listener = this.sessionRef.child('students').on('value', snapshot => {
            const students = snapshot.val() || {};
            callback(students);
        });

        this.listeners.students = listener;
        return listener;
    }

    onStudentParameterChange(studentId, callback) {
        const listener = this.sessionRef.child(`students/${studentId}/parameters`).on('value', snapshot => {
            const parameters = snapshot.val();
            if (parameters) {
                callback(parameters);
            }
        });

        this.listeners[`student_${studentId}`] = listener;
        return listener;
    }

    onCommandChange(callback) {
        const listener = this.sessionRef.child('commands').on('value', snapshot => {
            const commands = snapshot.val();
            if (commands) {
                callback(commands);
            }
        });

        this.listeners.commands = listener;
        return listener;
    }

    onTelemetryUpdate(carNumber, callback) {
        const listener = this.sessionRef.child(`telemetry/${carNumber}`).on('value', snapshot => {
            const telemetry = snapshot.val();
            if (telemetry) {
                callback(telemetry);
            }
        });

        this.listeners[`telemetry_${carNumber}`] = listener;
        return listener;
    }

    // Cleanup
    removeAllListeners() {
        Object.keys(this.listeners).forEach(key => {
            if (key === 'students') {
                this.sessionRef.child('students').off('value', this.listeners[key]);
            } else if (key === 'commands') {
                this.sessionRef.child('commands').off('value', this.listeners[key]);
            } else if (key.startsWith('student_')) {
                const studentId = key.replace('student_', '');
                this.sessionRef.child(`students/${studentId}/parameters`).off('value', this.listeners[key]);
            } else if (key.startsWith('telemetry_')) {
                const carNumber = key.replace('telemetry_', '');
                this.sessionRef.child(`telemetry/${carNumber}`).off('value', this.listeners[key]);
            }
        });

        this.listeners = {};
    }

    // Utility Functions
    async getSessionData() {
        const snapshot = await this.sessionRef.once('value');
        return snapshot.val();
    }

    async exportSessionData() {
        const data = await this.getSessionData();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `session_${this.sessionId}_${Date.now()}.json`;
        a.click();
        
        URL.revokeObjectURL(url);
    }

    // Session Management
    async endSession() {
        await this.sessionRef.child('metadata/status').set('completed');
        this.removeAllListeners();
    }

    // Race State Management
    async updateRaceState(state) {
        // state can be: 'idle', 'preparing', 'countdown', 'racing', 'finished', 'paused'
        const raceData = {
            state: state,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        };

        await this.sessionRef.child('race/state').set(raceData);
    }

    async setActiveRacers(carNumbers) {
        // Set which cars are actively participating in the race
        await this.sessionRef.child('race/activeCars').set(carNumbers);
    }

    async updateCountdown(count) {
        // Update countdown value (3, 2, 1, 0)
        await this.sessionRef.child('race/countdown').set(count);
    }

    async recordLapTime(carNumber, lapTime, lapCount) {
        const lapData = {
            carNumber: carNumber,
            lapTime: lapTime,
            lapCount: lapCount,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        };

        // Store in race history
        await this.sessionRef.child(`race/lapHistory/${carNumber}`).push(lapData);

        // Update current lap info
        await this.sessionRef.child(`telemetry/${carNumber}`).update({
            currentLapTime: lapTime,
            totalLaps: lapCount
        });
    }

    async updateCarPosition(carNumber, position, speed, stability) {
        const positionData = {
            position: position,
            speed: speed,
            stability: stability,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        };

        await this.sessionRef.child(`telemetry/${carNumber}`).update(positionData);
    }

    onRaceStateChange(callback) {
        const listener = this.sessionRef.child('race/state').on('value', snapshot => {
            const state = snapshot.val();
            if (state) {
                callback(state);
            }
        });

        this.listeners.raceState = listener;
        return listener;
    }

    async configureRaceSession(config) {
        // Configure race parameters
        const raceConfig = {
            totalLaps: config.totalLaps || 5,
            trackLayout: config.trackLayout || 'default',
            maxDuration: config.maxDuration || 300, // seconds
            enableOvertaking: config.enableOvertaking !== false,
            enableCollisions: config.enableCollisions !== false,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        };

        await this.sessionRef.child('race/configuration').set(raceConfig);
        return raceConfig;
    }
}

// WebSocket Bridge Integration
class WebSocketBridge {
    constructor(url = 'ws://localhost:8765') {
        this.url = url;
        this.ws = null;
        this.reconnectInterval = 5000;
        this.shouldReconnect = true;
        this.messageQueue = [];
        this.handlers = {};
    }

    connect() {
        return new Promise((resolve, reject) => {
            this.ws = new WebSocket(this.url);

            this.ws.onopen = () => {
                console.log('WebSocket connected');
                this.flushMessageQueue();
                resolve();
            };

            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.handleMessage(data);
                } catch (error) {
                    console.error('Error parsing WebSocket message:', error);
                }
            };

            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                reject(error);
            };

            this.ws.onclose = () => {
                console.log('WebSocket disconnected');
                if (this.shouldReconnect) {
                    setTimeout(() => this.connect(), this.reconnectInterval);
                }
            };
        });
    }

    disconnect() {
        this.shouldReconnect = false;
        if (this.ws) {
            this.ws.close();
        }
    }

    send(data) {
        const message = JSON.stringify(data);
        
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(message);
        } else {
            this.messageQueue.push(message);
        }
    }

    flushMessageQueue() {
        while (this.messageQueue.length > 0) {
            const message = this.messageQueue.shift();
            this.ws.send(message);
        }
    }

    handleMessage(data) {
        const type = data.type;
        if (this.handlers[type]) {
            this.handlers[type].forEach(handler => handler(data));
        }
    }

    on(messageType, handler) {
        if (!this.handlers[messageType]) {
            this.handlers[messageType] = [];
        }
        this.handlers[messageType].push(handler);
    }

    off(messageType, handler) {
        if (this.handlers[messageType]) {
            const index = this.handlers[messageType].indexOf(handler);
            if (index > -1) {
                this.handlers[messageType].splice(index, 1);
            }
        }
    }

    // Helper methods for common operations
    sendStudentParameters(studentId, carNumber, parameters) {
        this.send({
            type: 'STUDENT_PARAMETERS',
            studentId: studentId,
            carNumber: carNumber,
            parameters: parameters
        });
    }

    applyParametersToROS(carNumber, parameters) {
        this.send({
            type: 'APPLY_TO_ROS',
            carNumber: carNumber,
            parameters: parameters
        });
    }

    sendRaceCommand(command) {
        this.send({
            type: 'RACE_COMMAND',
            command: command // 'START_RACE', 'STOP_RACE', 'RESET'
        });
    }

    requestTelemetry() {
        this.send({
            type: 'GET_TELEMETRY'
        });
    }

    emergencyStop() {
        this.send({
            type: 'EMERGENCY_STOP'
        });
    }

    // Enhanced telemetry methods
    enableControl(carNumber, enabled) {
        this.send({
            type: 'ENABLE_CONTROL',
            carNumber: carNumber,
            enabled: enabled
        });
    }

    resetPosition(carNumber, position) {
        this.send({
            type: 'RESET_POSITION',
            carNumber: carNumber,
            position: position
        });
    }

    configureSession(activeCars) {
        this.send({
            type: 'CONFIGURE_SESSION',
            activeCars: activeCars
        });
    }

    updateRaceState(state) {
        this.send({
            type: 'UPDATE_RACE_STATE',
            state: state
        });
    }
}

// Helper class to bridge Firebase and WebSocket
class RacingSessionManager {
    constructor(sessionId = null) {
        this.firebaseManager = new FirebaseManager(sessionId);
        this.wsbridge = new WebSocketBridge();
        this.telemetryInterval = null;
        this.isConnected = false;
    }

    async initialize(instructorName = 'Instructor') {
        // Initialize Firebase session
        const sessionId = await this.firebaseManager.initializeSession(instructorName);

        // Connect WebSocket
        await this.wsbridge.connect();
        this.isConnected = true;

        // Setup bidirectional sync
        this.setupFirebaseToWebSocket();
        this.setupWebSocketToFirebase();

        return sessionId;
    }

    setupFirebaseToWebSocket() {
        // Sync student parameter changes to ROS2
        this.firebaseManager.onStudentChange((students) => {
            Object.entries(students).forEach(([studentId, studentData]) => {
                if (studentData.parameters && !studentData.locked) {
                    this.wsbridge.applyParametersToROS(
                        studentData.carNumber,
                        studentData.parameters
                    );
                }
            });
        });

        // Sync race commands to ROS2
        this.firebaseManager.onCommandChange((commands) => {
            if (commands.raceStatus) {
                switch(commands.raceStatus) {
                    case 'running':
                        this.wsbridge.sendRaceCommand('START_RACE');
                        break;
                    case 'stopped':
                        this.wsbridge.sendRaceCommand('STOP_RACE');
                        break;
                    case 'paused':
                        this.wsbridge.sendRaceCommand('PAUSE_RACE');
                        break;
                }
            }
        });

        // Sync race state changes
        this.firebaseManager.onRaceStateChange((state) => {
            this.wsbridge.updateRaceState(state.state);
        });
    }

    setupWebSocketToFirebase() {
        // Handle telemetry updates from ROS2
        this.wsbridge.on('TELEMETRY', async (data) => {
            if (data.cars) {
                for (const [carNum, carData] of Object.entries(data.cars)) {
                    await this.firebaseManager.updateCarPosition(
                        carNum,
                        carData.position,
                        carData.speed,
                        carData.stability
                    );

                    // Update lap times if available
                    if (carData.lap_count && carData.lap_time) {
                        await this.firebaseManager.recordLapTime(
                            carNum,
                            carData.lap_time,
                            carData.lap_count
                        );
                    }
                }
            }
        });

        // Handle race state updates from ROS2
        this.wsbridge.on('RACE_STATE', async (data) => {
            await this.firebaseManager.updateRaceState(data.state);
        });

        // Handle countdown updates
        this.wsbridge.on('COUNTDOWN', async (data) => {
            await this.firebaseManager.updateCountdown(data.count);
        });

        // Handle parameter confirmations
        this.wsbridge.on('PARAMETERS_APPLIED', async (data) => {
            console.log(`Parameters applied to car ${data.carNumber}`);
        });
    }

    async startRace(activeCars) {
        // Configure session with active cars
        await this.firebaseManager.setActiveRacers(activeCars);
        this.wsbridge.configureSession(activeCars);

        // Start race sequence
        await this.firebaseManager.updateRaceState('preparing');
        this.wsbridge.sendRaceCommand('START_RACE');
    }

    async stopRace() {
        await this.firebaseManager.updateRaceState('finished');
        this.wsbridge.sendRaceCommand('STOP_RACE');

        // Export session data
        const sessionData = await this.firebaseManager.getSessionData();
        console.log('Race finished. Session data:', sessionData);
    }

    async emergencyStop() {
        this.wsbridge.emergencyStop();
        await this.firebaseManager.updateRaceState('stopped');
        await this.firebaseManager.setGlobalLock(true);
    }

    disconnect() {
        if (this.telemetryInterval) {
            clearInterval(this.telemetryInterval);
        }
        this.wsbridge.disconnect();
        this.firebaseManager.removeAllListeners();
        this.isConnected = false;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { FirebaseManager, WebSocketBridge, RacingSessionManager };
}