export interface InputEvent {
  type: 'dpad' | 'button' | 'swipe' | 'touch' | 'accelerometer' | 'voice' | 'canvas';
  action: string;
  data: any;
  timestamp: number;
}

export interface ControllerInput {
  deviceId: string;
  deviceName: string;
  deviceType: 'phone' | 'console';
  input: InputEvent;
  webrtcMessage: boolean; // true if came via WebRTC, false if via Supabase
}

export interface InputMapping {
  deviceId: string;
  deviceName: string;
  inputType: string;
  mappedAction: string;
  isActive: boolean;
}

export class InputRouter {
  private inputMappings = new Map<string, InputMapping[]>();
  private deviceNames = new Map<string, string>();
  private inputHistory: ControllerInput[] = [];
  private maxHistorySize = 100;
  
  private onInputCallback?: (input: ControllerInput) => void;
  private onMappingChangeCallback?: (deviceId: string, mappings: InputMapping[]) => void;

  constructor(
    onInput?: (input: ControllerInput) => void,
    onMappingChange?: (deviceId: string, mappings: InputMapping[]) => void
  ) {
    this.onInputCallback = onInput;
    this.onMappingChangeCallback = onMappingChange;
  }

  // Register a device with its name for identification
  registerDevice(deviceId: string, deviceName: string, deviceType: 'phone' | 'console' = 'phone') {
    this.deviceNames.set(deviceId, deviceName);
    
    // Set up default input mappings for new devices
    if (!this.inputMappings.has(deviceId)) {
      const defaultMappings = this.createDefaultMappings(deviceId, deviceName, deviceType);
      this.inputMappings.set(deviceId, defaultMappings);
      this.onMappingChangeCallback?.(deviceId, defaultMappings);
    }
    
    console.log(`🎮 [InputRouter] Registered device: ${deviceName} (${deviceId.slice(-8)}) as ${deviceType}`);
  }

  // Create default input mappings for a device
  private createDefaultMappings(deviceId: string, deviceName: string, deviceType: 'phone' | 'console'): InputMapping[] {
    if (deviceType === 'console') {
      return []; // Console doesn't need input mappings
    }

    // Default phone controller mappings (simplified for new UI)
    return [
      {
        deviceId,
        deviceName,
        inputType: 'dpad.up',
        mappedAction: 'move_up',
        isActive: true
      },
      {
        deviceId,
        deviceName,
        inputType: 'dpad.down',
        mappedAction: 'move_down',
        isActive: true
      },
      {
        deviceId,
        deviceName,
        inputType: 'dpad.left',
        mappedAction: 'move_left',
        isActive: true
      },
      {
        deviceId,
        deviceName,
        inputType: 'dpad.right',
        mappedAction: 'move_right',
        isActive: true
      },
      {
        deviceId,
        deviceName,
        inputType: 'button.folder',
        mappedAction: 'open_files',
        isActive: true
      },
      {
        deviceId,
        deviceName,
        inputType: 'voice.recording',
        mappedAction: 'voice_input',
        isActive: true
      },
      {
        deviceId,
        deviceName,
        inputType: 'canvas.draw_move',
        mappedAction: 'canvas_draw',
        isActive: true
      }
    ];
  }

  // Process incoming WebRTC message with input data
  processWebRTCInput(deviceId: string, message: any): ControllerInput | null {
    const deviceName = this.deviceNames.get(deviceId) || 'Unknown Device';
    
    console.log(`📨 [InputRouter] Processing WebRTC input from ${deviceName}:`, message.type);

    try {
      // Handle different message types and extract input events
      let inputEvent: InputEvent | null = null;

      if (message.type === 'navigation' || message.type === 'game_data') {
        inputEvent = this.extractInputFromMessage(message);
      }

      if (!inputEvent) {
        return null;
      }

      const controllerInput: ControllerInput = {
        deviceId,
        deviceName,
        deviceType: 'phone',
        input: inputEvent,
        webrtcMessage: true
      };

      this.addToHistory(controllerInput);
      this.onInputCallback?.(controllerInput);

      console.log(`✅ [InputRouter] Processed WebRTC input: ${inputEvent.type}.${inputEvent.action}`);
      return controllerInput;

    } catch (error) {
      console.error(`❌ [InputRouter] Error processing WebRTC input:`, error);
      return null;
    }
  }

  // ENHANCED: Extract input event from various message formats including new types
  private extractInputFromMessage(message: any): InputEvent | null {
    const data = message.data;
    
    // Handle AirConsole-style dpad input
    if (data?.dpad) {
      const dpadData = data.dpad;
      const actionKey = Object.keys(dpadData)[0];
      const actionData = dpadData[actionKey];
      
      return {
        type: 'dpad',
        action: actionData.direction || actionKey,
        data: actionData,
        timestamp: message.timestamp || Date.now()
      };
    }

    // Handle button input
    if (data?.button) {
      const buttonName = Object.keys(data.button)[0];
      const buttonData = data.button[buttonName];
      return {
        type: 'button',
        action: buttonName,
        data: buttonData,
        timestamp: message.timestamp || Date.now()
      };
    }

    // NEW: Handle voice input
    if (data?.voice) {
      const voiceAction = Object.keys(data.voice)[0];
      const voiceData = data.voice[voiceAction];
      console.log(`🎤 [InputRouter] Extracted voice input: ${voiceAction}`, voiceData);
      return {
        type: 'voice',
        action: voiceAction,
        data: voiceData,
        timestamp: message.timestamp || Date.now()
      };
    }

    // NEW: Handle canvas input
    if (data?.canvas) {
      const canvasAction = Object.keys(data.canvas)[0];
      const canvasData = data.canvas[canvasAction];
      console.log(`🎨 [InputRouter] Extracted canvas input: ${canvasAction}`, canvasData);
      return {
        type: 'canvas',
        action: canvasAction,
        data: canvasData,
        timestamp: message.timestamp || Date.now()
      };
    }

    return null;
  }

  // Process device input from database
  processDeviceInput(deviceInput: any): ControllerInput | null {
    const deviceName = this.deviceNames.get(deviceInput.device_id) || 'Unknown Device';
    
    console.log(`📡 [InputRouter] Processing device input from ${deviceName}:`, deviceInput.input_type, deviceInput.input_action);

    try {
      const inputEvent: InputEvent = {
        type: deviceInput.input_type,
        action: deviceInput.input_action,
        data: deviceInput.input_data || {},
        timestamp: new Date(deviceInput.timestamp).getTime()
      };

      const controllerInput: ControllerInput = {
        deviceId: deviceInput.device_id,
        deviceName,
        deviceType: 'phone',
        input: inputEvent,
        webrtcMessage: deviceInput.source === 'webrtc'
      };

      this.addToHistory(controllerInput);
      this.onInputCallback?.(controllerInput);

      console.log(`✅ [InputRouter] Processed device input: ${inputEvent.type}.${inputEvent.action}`);
      return controllerInput;

    } catch (error) {
      console.error(`❌ [InputRouter] Error processing device input:`, error);
      return null;
    }
  }

  // Add input to history with size limit
  private addToHistory(input: ControllerInput) {
    this.inputHistory.unshift(input);
    if (this.inputHistory.length > this.maxHistorySize) {
      this.inputHistory = this.inputHistory.slice(0, this.maxHistorySize);
    }
  }

  // Get input history for debugging
  getInputHistory(deviceId?: string, limit: number = 20): ControllerInput[] {
    let history = this.inputHistory;
    
    if (deviceId) {
      history = history.filter(input => input.deviceId === deviceId);
    }
    
    return history.slice(0, limit);
  }

  // Get all registered devices
  getRegisteredDevices(): Array<{ deviceId: string; deviceName: string }> {
    return Array.from(this.deviceNames.entries()).map(([deviceId, deviceName]) => ({
      deviceId,
      deviceName
    }));
  }

  // Unregister a device
  unregisterDevice(deviceId: string) {
    const deviceName = this.deviceNames.get(deviceId);
    this.deviceNames.delete(deviceId);
    this.inputMappings.delete(deviceId);
    
    // Remove from history
    this.inputHistory = this.inputHistory.filter(input => input.deviceId !== deviceId);
    
    console.log(`🗑️ [InputRouter] Unregistered device: ${deviceName} (${deviceId.slice(-8)})`);
  }

  // Clear all data
  clear() {
    this.deviceNames.clear();
    this.inputMappings.clear();
    this.inputHistory = [];
    console.log('🧹 [InputRouter] Cleared all input router data');
  }
}